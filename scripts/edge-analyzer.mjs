#!/usr/bin/env node
/**
 * Edge Analyzer — Generic edge detection framework
 *
 * Compares model probability (from external data) against market price.
 * Supports pluggable data sources and probability models.
 *
 * Usage:
 *   node edge-analyzer.mjs --market <event-slug> [--data-source twc|ensemble|polls|odds]
 *   node edge-analyzer.mjs --market highest-temperature-in-nyc-on-march-20-2025 --data-source ensemble
 *
 * As module:
 *   import { analyzeEdge, fetchMarketBuckets } from './edge-analyzer.mjs';
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

export async function fetchMarketBuckets(eventSlug) {
  const events = await fetchWithRetry(`${GAMMA_API}/events?slug=${eventSlug}`);
  if (!events?.[0]) throw new Error(`Event not found: ${eventSlug}`);

  const event = events[0];
  const buckets = [];

  for (const m of event.markets || []) {
    const prices = JSON.parse(m.outcomePrices || '[]');
    const tokenIds = JSON.parse(m.clobTokenIds || '[]');

    // Fetch orderbook for each bucket
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

    buckets.push({
      title: m.groupItemTitle || m.question,
      slug: m.slug,
      yesPrice: parseFloat(prices[0] || 0),
      volume: parseFloat(m.volume || 0),
      yesTokenId: tokenIds[0],
      noTokenId: tokenIds[1],
      ...orderbook,
    });
  }

  return {
    event: { title: event.title, slug: event.slug, volume: event.volume, endDate: event.endDate },
    buckets,
  };
}

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

// ─── Edge Analysis ───

/**
 * Core edge analysis: compare model probabilities to market prices
 * @param {Array} buckets - market buckets with yesPrice
 * @param {Function} modelFn - async function returning { probabilities: Map<title, prob> }
 * @returns {Array} ranked edges
 */
export async function analyzeEdge(buckets, modelFn) {
  const model = await modelFn(buckets);

  return buckets.map(b => {
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
    console.error('Example: node edge-analyzer.mjs --market highest-temperature-in-nyc-on-march-20-2025');
    process.exit(1);
  }

  console.log('═══════════════════════════════════════');
  console.log('  Edge Analyzer');
  console.log('═══════════════════════════════════════\n');

  console.log(`Fetching market data: ${eventSlug}...`);
  const { event, buckets } = await fetchMarketBuckets(eventSlug);

  console.log(`Event: ${event.title}`);
  console.log(`Volume: $${Math.round(parseFloat(event.volume || 0)).toLocaleString()}`);
  console.log(`Buckets: ${buckets.length}\n`);

  // Display current market state
  console.log('Bucket              | Market | Spread | Bid Depth | Volume');
  console.log('─'.repeat(65));
  for (const b of buckets.sort((a, b) => b.yesPrice - a.yesPrice)) {
    const title = (b.title || '').padEnd(20);
    const price = `${(b.yesPrice * 100).toFixed(1)}¢`.padStart(6);
    const spread = `${(b.spread * 100).toFixed(1)}¢`.padStart(6);
    const depth = `$${b.bidDepth.toFixed(0)}`.padStart(9);
    const vol = `$${Math.round(b.volume).toLocaleString()}`.padStart(9);
    console.log(`${title}| ${price} | ${spread} | ${depth} | ${vol}`);
  }

  console.log('\n💡 To calculate edge, pair this with a probability model.');
  console.log('   The agent should use external data sources to estimate P(outcome)');
  console.log('   and compare against market prices shown above.');

  // Structured output
  console.log('\n---JSON---');
  console.log(JSON.stringify({
    analysisTime: new Date().toISOString(),
    event,
    buckets: buckets.map(b => ({
      title: b.title, yesPrice: b.yesPrice, spread: b.spread,
      bidDepth: b.bidDepth, yesTokenId: b.yesTokenId,
    })),
  }));
  console.log('---JSON---');
}

if (process.argv[1]?.includes('edge-analyzer')) {
  main().catch(e => { console.error('Error:', e.message); process.exit(1); });
}
