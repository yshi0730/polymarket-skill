#!/usr/bin/env node
/**
 * Edge Analyzer — Generic edge detection framework
 *
 * Compares model probability (from external data) against market price.
 * Supports pluggable data sources and probability models.
 * Supports both binary (YES/NO) and bucket (multi-outcome) markets.
 *
 * Usage:
 *   node edge-analyzer.mjs --market <event-slug> [--data-source ensemble|polls|odds|custom]
 *   node edge-analyzer.mjs --market us-presidential-election-2028-popular-vote --data-source ensemble
 *
 * As module:
 *   import { analyzeEdge, fetchMarketData } from './edge-analyzer.mjs';
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const GAMMA_API = 'https://gamma-api.polymarket.com';
const CLOB_API = 'https://clob.polymarket.com';

// ─── API Helpers ───

async function fetchJSON(url, timeoutMs = 15_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
    return await res.json();
  } finally { clearTimeout(timer); }
}

async function fetchWithRetry(url, retries = 2) {
  for (let i = 0; i <= retries; i++) {
    try { return await fetchJSON(url); }
    catch (e) {
      if (i === retries) throw e;
      await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
  }
}

// ─── Market Data ───

export async function fetchMarketData(eventSlug) {
  const events = await fetchWithRetry(`${GAMMA_API}/events?slug=${eventSlug}`);
  if (!events?.[0]) throw new Error(`Event not found: ${eventSlug}`);

  const event = events[0];
  const outcomes = [];

  for (const m of event.markets || []) {
    const prices = JSON.parse(m.outcomePrices || '[]');
    const tokenIds = JSON.parse(m.clobTokenIds || '[]');

    // Fetch orderbook for each outcome
    let orderbook = { bestBid: 0, bestAsk: 1, spread: 1, bidDepth: 0 };
    if (tokenIds[0]) {
      try {
        const book = await fetchJSON(`${CLOB_API}/book?token_id=${tokenIds[0]}`);
        const bids = (book.bids || []).map(b => ({ price: parseFloat(b.price), size: parseFloat(b.size) }));
        const asks = (book.asks || []).map(a => ({ price: parseFloat(a.price), size: parseFloat(a.size) }));
        orderbook = {
          bestBid: bids[0]?.price || 0,
          bestAsk: asks[0]?.price || 1,
          spread: (asks[0]?.price || 1) - (bids[0]?.price || 0),
          bidDepth: bids.reduce((s, b) => s + b.size * b.price, 0),
          bids, asks,
        };
      } catch {}
    }

    outcomes.push({
      title: m.groupItemTitle || m.question,
      slug: m.slug,
      yesPrice: parseFloat(prices[0] || 0),
      volume: parseFloat(m.volume || 0),
      yesTokenId: tokenIds[0],
      noTokenId: tokenIds[1],
      ...orderbook,
    });
  }

  const marketType = (event.markets || []).length === 1 ? 'binary' : 'bucket';

  return {
    event: { title: event.title, slug: event.slug, volume: event.volume, endDate: event.endDate },
    outcomes,
    marketType,
  };
}

// Backward compatibility
export { fetchMarketData as fetchMarketBuckets };

// ─── Probability Models ───

// Normal CDF approximation
function normalCDF(x) {
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
  const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x) / Math.sqrt(2);
  const t = 1.0 / (1.0 + p * ax);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-ax * ax);
  return 0.5 * (1.0 + sign * y);
}

/**
 * Calculate bucket probability from a normal distribution
 * @param {number} expectedValue - expected outcome value
 * @param {number} sigma - standard deviation
 * @param {number} lo - bucket lower bound
 * @param {number} hi - bucket upper bound
 */
export function bucketProbability(expectedValue, sigma, lo, hi) {
  if (sigma <= 0) return (expectedValue >= lo && expectedValue <= hi) ? 1 : 0;
  return normalCDF((hi + 0.5 - expectedValue) / sigma) - normalCDF((lo - 0.5 - expectedValue) / sigma);
}

/**
 * Calculate bucket probabilities from ensemble members
 * @param {number[]} members - array of outcome values from ensemble
 * @param {Array} buckets - array of { lo, hi } bucket definitions
 */
export function ensembleToBucketProbs(members, buckets) {
  const counts = new Map();
  for (const val of members) {
    const rounded = Math.round(val);
    for (const b of buckets) {
      if (rounded >= b.lo && rounded <= b.hi) {
        counts.set(b.title, (counts.get(b.title) || 0) + 1);
        break;
      }
    }
  }
  return buckets.map(b => ({
    ...b,
    modelProb: (counts.get(b.title) || 0) / members.length,
    memberCount: counts.get(b.title) || 0,
  }));
}

// ─── Example Model Functions ───

/**
 * Example model function: poll-based probability model for politics markets.
 *
 * A modelFn receives the market outcomes and returns { probabilities: Map<title, prob> }.
 * This example shows how to build one from polling data. Replace the hardcoded
 * poll data with a real API call (e.g., FiveThirtyEight, RealClearPolitics).
 *
 * Usage with analyzeEdge:
 *   const edges = await analyzeEdge(outcomes, exampleModelFn);
 *
 * @param {Array} outcomes - market outcomes from fetchMarketData()
 * @returns {{ probabilities: Map<string, number>, source: string }}
 */
export async function exampleModelFn(outcomes) {
  // Step 1: Get your external data.
  // In production, fetch from a real API. Here we simulate poll data.
  const pollEstimate = 49.5;  // e.g., polling average says 49.5%
  const pollStdDev = 3.0;     // uncertainty (wider = more spread across buckets)

  // Step 2: Parse bucket boundaries from titles.
  // Expects titles like "48-50%", "50-52%", ">54%", "<44%", etc.
  const parsed = outcomes.map(b => {
    const range = (b.title || '').match(/([\d.]+)\s*[-–]\s*([\d.]+)/);
    const gt = (b.title || '').match(/[>≥]\s*([\d.]+)/);
    const lt = (b.title || '').match(/[<≤]\s*([\d.]+)/);

    let lo, hi;
    if (range) { lo = parseFloat(range[1]); hi = parseFloat(range[2]); }
    else if (gt) { lo = parseFloat(gt[1]); hi = lo + 20; }  // open-ended upper
    else if (lt) { hi = parseFloat(lt[1]); lo = hi - 20; }   // open-ended lower
    else { return { title: b.title, lo: null, hi: null }; }

    return { title: b.title, lo, hi };
  });

  // Step 3: Calculate probability for each bucket using normal distribution.
  const probabilities = new Map();
  let totalProb = 0;

  for (const p of parsed) {
    if (p.lo === null) {
      probabilities.set(p.title, 0);
      continue;
    }
    const prob = bucketProbability(pollEstimate, pollStdDev, p.lo, p.hi);
    probabilities.set(p.title, prob);
    totalProb += prob;
  }

  // Step 4: Normalize so probabilities sum to 1.
  if (totalProb > 0) {
    for (const [title, prob] of probabilities) {
      probabilities.set(title, prob / totalProb);
    }
  }

  return { probabilities, source: 'poll-based-example' };
}

/**
 * Example model function for binary markets.
 *
 * A binary modelFn receives the market outcomes (single entry) and returns
 * { probabilities: Map<title, prob> }. Replace the hardcoded probability
 * with a real data-driven estimate.
 *
 * @param {Array} outcomes - market outcomes from fetchMarketData()
 * @returns {{ probabilities: Map<string, number>, source: string }}
 */
export async function exampleBinaryModelFn(outcomes) {
  // Step 1: Get your external data.
  // In production, fetch from a real API (news, polls, on-chain data, etc.)
  const modelProbability = 0.65;  // your estimate of P(YES)

  // Step 2: Map to outcomes.
  const probabilities = new Map();
  probabilities.set(outcomes[0].title, modelProbability);

  return { probabilities, source: 'binary-example' };
}

// ─── Edge Analysis ───

/**
 * Core edge analysis: compare model probabilities to market prices
 * @param {Array} outcomes - market outcomes with yesPrice
 * @param {Function} modelFn - async function returning { probabilities: Map<title, prob> }
 * @returns {Array} ranked edges
 */
export async function analyzeEdge(outcomes, modelFn) {
  const model = await modelFn(outcomes);

  return outcomes.map(b => {
    const modelProb = model.probabilities.get(b.title) || 0;
    const edge = modelProb - b.yesPrice;
    return {
      ...b,
      modelProb,
      edge,
      edgePct: (edge * 100).toFixed(1),
      // Kelly criterion for optimal sizing (half-Kelly for safety)
      kellyFraction: edge > 0 ? ((modelProb * (1 / b.yesPrice - 1) - (1 - modelProb)) / (1 / b.yesPrice - 1)) / 2 : 0,
    };
  }).sort((a, b) => b.edge - a.edge);
}

/**
 * Generate position sizing recommendations
 */
export function sizeRecommendations(edges, config = {}) {
  const {
    maxSinglePosition = 25,
    maxTotalExposure = 100,
    edgeThreshold = 0.05,
    minBidDepth = 10,
  } = config;

  let totalAllocated = 0;
  const recs = [];

  for (const e of edges) {
    if (e.edge < edgeThreshold) continue;
    if (e.bidDepth < minBidDepth) continue;
    if (e.spread > 0.04) continue;

    // Size based on edge magnitude
    let size;
    if (e.edge > 0.20) size = maxSinglePosition;
    else if (e.edge > 0.15) size = Math.min(25, maxSinglePosition);
    else if (e.edge > 0.10) size = Math.min(20, maxSinglePosition);
    else size = Math.min(10, maxSinglePosition);

    // Cap to remaining budget
    size = Math.min(size, maxTotalExposure - totalAllocated);
    if (size <= 0) break;

    totalAllocated += size;
    recs.push({
      ...e,
      suggestedSize: size,
      action: 'BUY',
      confidence: e.edge > 0.15 ? 'HIGH' : e.edge > 0.10 ? 'MEDIUM' : 'LOW',
    });
  }

  return recs;
}

// ─── CLI ───

async function main() {
  const args = process.argv.slice(2);
  const getArg = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : null; };

  const eventSlug = getArg('--market');
  if (!eventSlug) {
    console.error('Usage: node edge-analyzer.mjs --market <event-slug> [--data-source <src>]');
    console.error('Example: node edge-analyzer.mjs --market us-presidential-election-2028-popular-vote');
    process.exit(1);
  }

  console.log('═══════════════════════════════════════');
  console.log('  Edge Analyzer');
  console.log('═══════════════════════════════════════\n');

  console.log(`Fetching market data: ${eventSlug}...`);
  const { event, outcomes } = await fetchMarketData(eventSlug);

  console.log(`Event: ${event.title}`);
  console.log(`Volume: $${Math.round(parseFloat(event.volume || 0)).toLocaleString()}`);
  console.log(`Outcomes: ${outcomes.length}\n`);

  // Display current market state
  console.log('Bucket              | Market | Spread | Bid Depth | Volume');
  console.log('─'.repeat(65));
  for (const b of outcomes.sort((a, b) => b.yesPrice - a.yesPrice)) {
    const title = (b.title || '').padEnd(20);
    const price = `${(b.yesPrice * 100).toFixed(1)}¢`.padStart(6);
    const spread = `${(b.spread * 100).toFixed(1)}¢`.padStart(6);
    const depth = `$${b.bidDepth.toFixed(0)}`.padStart(9);
    const vol = `$${Math.round(b.volume).toLocaleString()}`.padStart(9);
    console.log(`${title}| ${price} | ${spread} | ${depth} | ${vol}`);
  }

  // ─── Market-type-aware analysis ───
  const marketType = outcomes.length === 1 ? 'binary' : 'bucket';
  console.log(`\nMarket type: ${marketType === 'binary' ? 'Binary (YES/NO)' : `Bucket (${outcomes.length} outcomes)`}\n`);

  if (marketType === 'binary') {
    const o = outcomes[0];
    console.log('── Binary Market Analysis ──');
    console.log(`  Market price (YES): ${(o.yesPrice * 100).toFixed(1)}¢`);
    console.log(`  Implied probability: ${(o.yesPrice * 100).toFixed(1)}%`);
    console.log(`  Best bid: ${(o.bestBid * 100).toFixed(1)}¢ | Best ask: ${(o.bestAsk * 100).toFixed(1)}¢`);
    console.log(`  Spread: ${(o.spread * 100).toFixed(1)}¢ | Bid depth: $${o.bidDepth.toFixed(0)}`);
    console.log('');
    console.log('  To calculate edge:');
    console.log('    1. Estimate P(YES) using your external data sources');
    console.log('    2. Edge = P(YES) - market price');
    console.log('    3. If edge > your threshold and spread < 4¢ → candidate trade');
    console.log('    4. BUY YES if your P > market price, BUY NO if your P < (1 - market price)');
    console.log('');
    console.log('  Example:');
    console.log('    Your model: P(YES) = 65%');
    console.log(`    Market price: ${(o.yesPrice * 100).toFixed(1)}¢`);
    console.log(`    Edge: ${(0.65 * 100 - o.yesPrice * 100).toFixed(1)}%`);
  } else {
    // ─── Boundary Detection ───
    // For ranged/numeric buckets, detect when forecast could land near a boundary
    const numericBuckets = outcomes
      .map(b => {
        const m = (b.title || '').match(/([\.\d]+)/);
        return m ? { ...b, numVal: parseFloat(m[1]) } : null;
      })
      .filter(Boolean)
      .sort((a, b) => a.numVal - b.numVal);

    if (numericBuckets.length >= 2) {
      console.log('\n🎯 Boundary Analysis (adjacent bucket pairs):');
      console.log('Pair                          | Combined | Boundary');
      console.log('─'.repeat(55));
      for (let i = 0; i < numericBuckets.length - 1; i++) {
        const a = numericBuckets[i], b = numericBuckets[i + 1];
        const combined = a.yesPrice + b.yesPrice;
        const boundary = (a.numVal + b.numVal) / 2;
        const pairLabel = ((a.title || '').slice(0, 12) + ' + ' + (b.title || '').slice(0, 12)).padEnd(30);
        console.log(pairLabel + '| ' + (combined * 100).toFixed(1) + '¢'.padStart(6) + ' | ' + boundary.toFixed(1));
      }
      console.log('\n💡 Compare these combined costs against your model\'s probability estimates.');
      console.log('   Use your external data to determine whether any pairs are mispriced.');
    }
  }

  console.log('\n💡 To calculate edge, pair this with a probability model.');
  console.log('   The agent should use external data sources to estimate P(outcome)');
  console.log('   and compare against market prices shown above.');

  // Structured output
  console.log('\n---JSON---');
  console.log(JSON.stringify({
    analysisTime: new Date().toISOString(),
    event,
    marketType,
    outcomes: outcomes.map(b => ({
      title: b.title, yesPrice: b.yesPrice, spread: b.spread,
      bidDepth: b.bidDepth, yesTokenId: b.yesTokenId,
    })),
  }));
  console.log('---JSON---');
}

if (process.argv[1]?.includes('edge-analyzer')) {
  main().catch(e => { console.error('Error:', e.message); process.exit(1); });
}
