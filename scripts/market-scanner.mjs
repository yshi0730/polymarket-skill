#!/usr/bin/env node
/**
 * Market Scanner — find prediction market opportunities by category
 *
 * Scans Polymarket events via Gamma API, filters by volume/liquidity/time,
 * and outputs ranked opportunities with market data.
 *
 * Usage:
 *   node market-scanner.mjs [--category weather|politics|sports|crypto|all]
 *                           [--date YYYY-MM-DD] [--min-volume 1000]
 *                           [--min-edge 0.05] [--json]
 *
 * As module:
 *   import { scanMarkets } from './market-scanner.mjs';
 *   const results = await scanMarkets({ category: 'weather', minVolume: 1000 });
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKSPACE = process.env.POLYMARKET_WORKSPACE || join(__dirname, '..', '..');
const CONFIG_FILE = join(WORKSPACE, 'polymarket', 'config.json');

// ─── API Helpers ───

const GAMMA_API = 'https://gamma-api.polymarket.com';
const CLOB_API = 'https://clob.polymarket.com';

async function fetchJSON(url, timeoutMs = 10_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally { clearTimeout(timer); }
}

async function fetchWithRetry(url, retries = 2, delayMs = 1000) {
  for (let i = 0; i <= retries; i++) {
    try { return await fetchJSON(url); }
    catch (e) {
      if (i === retries) throw e;
      await new Promise(r => setTimeout(r, delayMs * (i + 1)));
    }
  }
}

// ─── Category Filters ───

const CATEGORY_KEYWORDS = {
  weather: ['temperature', 'weather', 'rainfall', 'hurricane', 'storm', 'snow', 'heat'],
  politics: ['election', 'president', 'congress', 'senate', 'governor', 'vote', 'poll', 'nominee', 'trump', 'biden'],
  sports: ['nfl', 'nba', 'mlb', 'nhl', 'soccer', 'football', 'basketball', 'baseball', 'championship', 'super bowl', 'world series'],
  crypto: ['bitcoin', 'btc', 'ethereum', 'eth', 'crypto', 'token', 'defi', 'solana', 'price'],
};

function matchesCategory(event, category) {
  if (category === 'all') return true;
  const keywords = CATEGORY_KEYWORDS[category] || [];
  const text = `${event.title || ''} ${event.description || ''} ${event.slug || ''}`.toLowerCase();
  return keywords.some(kw => text.includes(kw));
}

// ─── Orderbook Analysis ───

async function getOrderbookStats(tokenId) {
  try {
    const book = await fetchJSON(`${CLOB_API}/book?token_id=${tokenId}`);
    const bids = (book.bids || []).map(b => ({ price: parseFloat(b.price), size: parseFloat(b.size) }));
    const asks = (book.asks || []).map(a => ({ price: parseFloat(a.price), size: parseFloat(a.size) }));

    const bestBid = bids[0]?.price || 0;
    const bestAsk = asks[0]?.price || 1;
    const spread = bestAsk - bestBid;
    const bidDepth = bids.reduce((s, b) => s + b.size * b.price, 0);
    const askDepth = asks.reduce((s, a) => s + a.size * a.price, 0);

    return { bestBid, bestAsk, spread, bidDepth, askDepth, bids, asks };
  } catch {
    return { bestBid: 0, bestAsk: 1, spread: 1, bidDepth: 0, askDepth: 0, bids: [], asks: [] };
  }
}

// ─── Main Scanner ───

export async function scanMarkets(opts = {}) {
  const {
    category = 'all',
    minVolume = 1000,
    maxSpread = 0.04,
    limit = 50,
  } = opts;

  // Fetch active events
  const events = await fetchWithRetry(
    `${GAMMA_API}/events?closed=false&active=true&limit=${limit}&order=volume&ascending=false`
  );

  if (!events || events.length === 0) return [];

  const opportunities = [];

  for (const event of events) {
    if (!matchesCategory(event, category)) continue;

    const totalVolume = parseFloat(event.volume || 0);
    if (totalVolume < minVolume) continue;

    const markets = event.markets || [];

    for (const market of markets) {
      const prices = JSON.parse(market.outcomePrices || '[]');
      const yesPrice = parseFloat(prices[0] || 0);
      const noPrice = parseFloat(prices[1] || 0);

      // Skip extreme prices (already resolved or near-certain)
      if (yesPrice > 0.95 || yesPrice < 0.02) continue;

      // Get token IDs for orderbook check
      const tokenIds = JSON.parse(market.clobTokenIds || '[]');
      const yesTokenId = tokenIds[0];

      let orderbook = null;
      if (yesTokenId) {
        orderbook = await getOrderbookStats(yesTokenId);
        // Skip if spread too wide
        if (orderbook.spread > maxSpread) continue;
        // Skip if no liquidity
        if (orderbook.bidDepth < 5) continue;
      }

      const endDate = market.endDate || event.endDate;
      const hoursToEnd = endDate ? (new Date(endDate) - Date.now()) / 3600000 : null;

      opportunities.push({
        eventTitle: event.title,
        eventSlug: event.slug,
        marketQuestion: market.question || market.groupItemTitle,
        marketSlug: market.slug,
        yesPrice,
        noPrice,
        volume: parseFloat(market.volume || 0),
        totalEventVolume: totalVolume,
        spread: orderbook?.spread || null,
        bestBid: orderbook?.bestBid || 0,
        bestAsk: orderbook?.bestAsk || 1,
        bidDepth: orderbook?.bidDepth || 0,
        hoursToEnd,
        endDate,
        yesTokenId,
        noTokenId: tokenIds[1],
        category: detectCategory(event),
      });
    }
  }

  // Sort by volume (most liquid first)
  opportunities.sort((a, b) => b.volume - a.volume);

  return opportunities;
}

function detectCategory(event) {
  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    const text = `${event.title || ''} ${event.slug || ''}`.toLowerCase();
    if (keywords.some(kw => text.includes(kw))) return cat;
  }
  return 'other';
}

// ─── CLI Output ───

function formatOpportunity(opp, idx) {
  const lines = [];
  const spreadStr = opp.spread !== null ? `${(opp.spread * 100).toFixed(1)}¢` : '?';
  const timeStr = opp.hoursToEnd !== null ? `${Math.round(opp.hoursToEnd)}h` : '?';

  lines.push(`\n${idx + 1}. ${opp.marketQuestion}`);
  lines.push(`   Event: ${opp.eventTitle}`);
  lines.push(`   YES: ${(opp.yesPrice * 100).toFixed(1)}¢ | Spread: ${spreadStr} | Volume: $${Math.round(opp.volume).toLocaleString()} | Time: ${timeStr}`);
  lines.push(`   Bid depth: $${opp.bidDepth.toFixed(0)} | Category: ${opp.category}`);
  if (opp.yesTokenId) lines.push(`   Token: ${opp.yesTokenId.slice(0, 20)}...`);

  return lines.join('\n');
}

// ─── Main ───

async function main() {
  const args = process.argv.slice(2);
  const getArg = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : null; };
  const hasFlag = (flag) => args.includes(flag);

  const category = getArg('--category') || 'all';
  const minVolume = parseFloat(getArg('--min-volume') || '1000');
  const jsonOutput = hasFlag('--json');

  // Load config if exists
  let config = {};
  if (existsSync(CONFIG_FILE)) {
    try { config = JSON.parse(readFileSync(CONFIG_FILE, 'utf-8')); } catch {}
  }

  const effectiveMinVolume = minVolume || config.minVolume || 1000;
  const effectiveMaxSpread = parseFloat(getArg('--max-spread') || config.maxSpread || '0.04');

  console.log('═══════════════════════════════════════');
  console.log(`  Market Scanner — ${category.toUpperCase()}`);
  console.log('═══════════════════════════════════════');
  console.log(`Filters: volume>$${effectiveMinVolume}, spread<${(effectiveMaxSpread * 100).toFixed(0)}¢\n`);

  const opportunities = await scanMarkets({
    category,
    minVolume: effectiveMinVolume,
    maxSpread: effectiveMaxSpread,
  });

  if (jsonOutput) {
    console.log(JSON.stringify(opportunities, null, 2));
    return;
  }

  if (opportunities.length === 0) {
    console.log('No opportunities found matching filters.');
    return;
  }

  console.log(`Found ${opportunities.length} opportunities:\n`);
  for (let i = 0; i < Math.min(opportunities.length, 20); i++) {
    console.log(formatOpportunity(opportunities[i], i));
  }

  console.log(`\n${'─'.repeat(40)}`);
  console.log(`Total: ${opportunities.length} markets passing filters`);

  // Structured output for agent
  console.log('\n---JSON---');
  console.log(JSON.stringify({ scanTime: new Date().toISOString(), category, count: opportunities.length, opportunities: opportunities.slice(0, 20) }));
  console.log('---JSON---');
}

// Run CLI if executed directly
if (process.argv[1] && process.argv[1].includes('market-scanner')) {
  main().catch(e => { console.error('Scanner error:', e.message); process.exit(1); });
}
