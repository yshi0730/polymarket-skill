#!/usr/bin/env node
/**
 * Settlement Tracker — Track resolved markets and compute PnL
 *
 * Checks for resolved positions, calculates realized PnL per trade,
 * and generates cumulative stats. Writes to settlements.jsonl.
 *
 * Usage: node settlement-tracker.mjs
 * As module: import { checkSettlements, getStats } from './settlement-tracker.mjs';
 */

import { readFileSync, appendFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKSPACE = process.env.POLYMARKET_WORKSPACE || join(__dirname, '..', '..');
const DATA_DIR = join(WORKSPACE, 'polymarket', 'data');
const TRADES_FILE = join(DATA_DIR, 'trades.jsonl');
const SETTLEMENTS_FILE = join(DATA_DIR, 'settlements.jsonl');

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

// ─── Settlement Check ───

export async function checkSettlements() {
  const proxy = (process.env.POLYMARKET_PROXY || '').toLowerCase();
  if (!proxy) return [];

  // Get all positions including resolved ones
  const positions = await fetchJSON(`https://data-api.polymarket.com/positions?user=${proxy}&sizeThreshold=0`);
  if (!positions) return [];

  // Load already-tracked settlements
  const tracked = new Set();
  if (existsSync(SETTLEMENTS_FILE)) {
    for (const line of readFileSync(SETTLEMENTS_FILE, 'utf-8').trim().split('\n')) {
      try { tracked.add(JSON.parse(line).conditionId); } catch {}
    }
  }

  const settlements = [];
  for (const p of positions) {
    // Skip if already tracked or still open
    if (tracked.has(p.conditionId)) continue;
    if (!p.resolved && p.size > 0) continue;

    // Resolved or zero-size (settled)
    const cost = p.initialValue || 0;
    const payout = p.currentValue || 0;
    const pnl = payout - cost;
    const won = payout > cost;

    const entry = {
      ts: new Date().toISOString(),
      title: p.title,
      conditionId: p.conditionId,
      eventSlug: p.eventSlug,
      outcome: p.outcome,
      size: p.size,
      avgPrice: p.avgPrice,
      cost: +cost.toFixed(4),
      payout: +payout.toFixed(4),
      pnl: +pnl.toFixed(4),
      pnlPct: cost > 0 ? +((pnl / cost) * 100).toFixed(1) : 0,
      won,
    };

    settlements.push(entry);
    ensureDir();
    appendFileSync(SETTLEMENTS_FILE, JSON.stringify(entry) + '\n');
  }

  return settlements;
}

// ─── Cumulative Stats ───

export function getStats() {
  if (!existsSync(SETTLEMENTS_FILE)) return null;

  const lines = readFileSync(SETTLEMENTS_FILE, 'utf-8').trim().split('\n').filter(Boolean);
  const trades = lines.map(l => JSON.parse(l));

  if (trades.length === 0) return null;

  const totalPnl = trades.reduce((s, t) => s + t.pnl, 0);
  const totalCost = trades.reduce((s, t) => s + t.cost, 0);
  const wins = trades.filter(t => t.won).length;
  const losses = trades.length - wins;
  const avgPnl = totalPnl / trades.length;
  const bestTrade = trades.reduce((best, t) => t.pnl > best.pnl ? t : best, trades[0]);
  const worstTrade = trades.reduce((worst, t) => t.pnl < worst.pnl ? t : worst, trades[0]);

  // Max drawdown (sequential)
  let peak = 0, maxDD = 0, cumPnl = 0;
  for (const t of trades) {
    cumPnl += t.pnl;
    if (cumPnl > peak) peak = cumPnl;
    const dd = peak - cumPnl;
    if (dd > maxDD) maxDD = dd;
  }

  return {
    totalTrades: trades.length,
    wins, losses,
    winRate: +((wins / trades.length) * 100).toFixed(1),
    totalPnl: +totalPnl.toFixed(2),
    totalCost: +totalCost.toFixed(2),
    roi: totalCost > 0 ? +((totalPnl / totalCost) * 100).toFixed(1) : 0,
    avgPnl: +avgPnl.toFixed(2),
    maxDrawdown: +maxDD.toFixed(2),
    bestTrade: { title: bestTrade.title, pnl: bestTrade.pnl },
    worstTrade: { title: worstTrade.title, pnl: worstTrade.pnl },
  };
}

// ─── CLI ───

async function main() {
  console.log('═══════════════════════════════════════');
  console.log('  Settlement Tracker');
  console.log('═══════════════════════════════════════\n');

  const newSettlements = await checkSettlements();
  if (newSettlements.length > 0) {
    console.log(`Found ${newSettlements.length} new settlement(s):\n`);
    for (const s of newSettlements) {
      const icon = s.won ? '✅' : '❌';
      console.log(`  ${icon} ${s.title}`);
      console.log(`     Cost: $${s.cost.toFixed(2)} → Payout: $${s.payout.toFixed(2)} = ${s.pnl >= 0 ? '+' : ''}$${s.pnl.toFixed(2)} (${s.pnlPct}%)`);
    }
  } else {
    console.log('No new settlements.\n');
  }

  const stats = getStats();
  if (stats) {
    console.log('\n── Cumulative Stats ──');
    console.log(`  Trades:       ${stats.totalTrades} (${stats.wins}W / ${stats.losses}L)`);
    console.log(`  Win Rate:     ${stats.winRate}%`);
    console.log(`  Total P&L:    $${stats.totalPnl >= 0 ? '+' : ''}${stats.totalPnl.toFixed(2)} (${stats.roi}% ROI)`);
    console.log(`  Avg P&L:      $${stats.avgPnl.toFixed(2)}/trade`);
    console.log(`  Max Drawdown: $${stats.maxDrawdown.toFixed(2)}`);
    console.log(`  Best:         ${stats.bestTrade.title} (+$${stats.bestTrade.pnl.toFixed(2)})`);
    console.log(`  Worst:        ${stats.worstTrade.title} ($${stats.worstTrade.pnl.toFixed(2)})`);
  }

  console.log('\n---JSON---');
  console.log(JSON.stringify({ newSettlements, stats }));
  console.log('---JSON---');
}

if (process.argv[1]?.includes('settlement-tracker')) {
  main().catch(e => { console.error('Error:', e.message); process.exit(1); });
}
