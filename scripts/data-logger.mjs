#!/usr/bin/env node
/**
 * Data Logger — Append-only JSONL for backtesting
 *
 * Captures full market state at each tick: prices, orderbook snapshots,
 * volumes, and metadata. Designed to run every 30min via cron.
 *
 * Output: polymarket/data/market-history.jsonl
 *
 * Schema per line:
 * {
 *   ts: ISO timestamp,
 *   eventSlug: string,
 *   eventTitle: string,
 *   totalVolume: number,
 *   marketType: "binary" | "bucket",
 *   outcomes: [{ title, yesPrice, volume, bestBid, bestAsk, spread, bidDepth }],
 * }
 *
 * Usage:
 *   node data-logger.mjs [--events slug1,slug2] [--category weather]
 *   crontab: */30 * * * * node /path/to/data-logger.mjs
 *
 * As module:
 *   import { logMarketSnapshot } from './data-logger.mjs';
 */

import { appendFileSync, existsSync, readFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKSPACE = process.env.POLYMARKET_WORKSPACE || join(__dirname, '..', '..');
const DATA_DIR = join(WORKSPACE, 'polymarket', 'data');
const OUT_FILE = join(DATA_DIR, 'market-history.jsonl');
const CONFIG_FILE = join(WORKSPACE, 'polymarket', 'config.json');
const GAMMA_API = 'https://gamma-api.polymarket.com';
const CLOB_API = 'https://clob.polymarket.com';

function ensureDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

async function fetchJSON(url, timeoutMs = 10_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally { clearTimeout(timer); }
}

// ─── Snapshot ───

export async function logMarketSnapshot(eventSlug) {
  const events = await fetchJSON(`${GAMMA_API}/events?slug=${eventSlug}`);
  if (!events?.[0]) return null;

  const event = events[0];
  const outcomes = [];

  for (const m of event.markets || []) {
    const prices = JSON.parse(m.outcomePrices || '[]');
    const tokenIds = JSON.parse(m.clobTokenIds || '[]');

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
        };
      } catch {}
    }

    outcomes.push({
      title: m.groupItemTitle || m.question,
      yesPrice: parseFloat(prices[0] || 0),
      volume: parseFloat(m.volume || 0),
      ...orderbook,
    });
  }

  const marketType = outcomes.length === 1 ? 'binary' : 'bucket';
  const entry = {
    ts: new Date().toISOString(),
    eventSlug: event.slug,
    eventTitle: event.title,
    totalVolume: parseFloat(event.volume || 0),
    endDate: event.endDate,
    marketType,
    outcomes,
  };

  ensureDir();
  appendFileSync(OUT_FILE, JSON.stringify(entry) + '\n');
  return entry;
}

// ─── Main ───

async function main() {
  const args = process.argv.slice(2);
  const getArg = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : null; };

  const eventSlugs = getArg('--events')?.split(',') || [];

  // If no specific events, log events we have positions in
  if (eventSlugs.length === 0) {
    const proxy = (process.env.POLYMARKET_PROXY || '').toLowerCase();
    if (proxy) {
      try {
        const positions = await fetchJSON(`https://data-api.polymarket.com/positions?user=${proxy}&sizeThreshold=0`);
        const slugs = [...new Set((positions || []).filter(p => p.eventSlug && p.size >= 1).map(p => p.eventSlug))];
        eventSlugs.push(...slugs);
      } catch {}
    }

    // Also check config for tracked events
    if (existsSync(CONFIG_FILE)) {
      try {
        const config = JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'));
        if (config.trackedEvents) eventSlugs.push(...config.trackedEvents);
      } catch {}
    }
  }

  if (eventSlugs.length === 0) {
    // Log top active markets as fallback
    try {
      const events = await fetchJSON(`${GAMMA_API}/events?closed=false&active=true&limit=10&order=volume&ascending=false`);
      for (const e of events || []) {
        if (e.slug) eventSlugs.push(e.slug);
      }
    } catch {}
  }

  const unique = [...new Set(eventSlugs)];
  let logged = 0;

  for (const slug of unique) {
    try {
      const entry = await logMarketSnapshot(slug);
      if (entry) {
        logged++;
        console.log(`  ✓ ${slug} (${entry.marketType}, ${entry.outcomes.length} outcome${entry.outcomes.length === 1 ? '' : 's'})`);
      }
    } catch (e) {
      console.error(`  ✗ ${slug}: ${e.message}`);
    }
  }

  console.log(`${new Date().toISOString()} — logged ${logged}/${unique.length} events to ${OUT_FILE}`);
}

if (process.argv[1]?.includes('data-logger')) {
  main().catch(e => { console.error('Error:', e.message); process.exit(1); });
}
