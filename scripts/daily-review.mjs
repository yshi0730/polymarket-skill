#!/usr/bin/env node
/**
 * Daily Review — Auto-generate performance report
 *
 * Reads trades, settlements, and positions to produce a markdown report:
 *   - Total P&L, win rate, avg hold time
 *   - Best/worst trades
 *   - Edge decay analysis (are predictions getting worse?)
 *   - Open position summary
 *   - Actionable recommendations
 *
 * Usage: node daily-review.mjs [--days 7] [--output report.md]
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKSPACE = process.env.POLYMARKET_WORKSPACE || join(__dirname, '..', '..');
const DATA_DIR = join(WORKSPACE, 'polymarket', 'data');
const TRADES_FILE = join(DATA_DIR, 'trades.jsonl');
const SETTLEMENTS_FILE = join(DATA_DIR, 'settlements.jsonl');

async function fetchJSON(url, timeoutMs = 15_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally { clearTimeout(timer); }
}

function readJSONL(file) {
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf-8').trim().split('\n').filter(Boolean).map(l => {
    try { return JSON.parse(l); } catch { return null; }
  }).filter(Boolean);
}

// ─── Report Generation ───

async function generateReport(days = 7) {
  const cutoff = new Date(Date.now() - days * 86400000).toISOString();

  // Load data
  const allTrades = readJSONL(TRADES_FILE);
  const allSettlements = readJSONL(SETTLEMENTS_FILE);
  const recentTrades = allTrades.filter(t => t.ts >= cutoff);
  const recentSettlements = allSettlements.filter(s => s.ts >= cutoff);

  // Current positions
  let positions = [];
  const proxy = (process.env.POLYMARKET_PROXY || '').toLowerCase();
  if (proxy) {
    try {
      const data = await fetchJSON(`https://data-api.polymarket.com/positions?user=${proxy}&sizeThreshold=0`);
      positions = (data || []).filter(p => p.size >= 1);
    } catch {}
  }

  // Calculate stats
  const buys = recentTrades.filter(t => t.action === 'BUY' && t.status !== 'BLOCKED' && t.status !== 'DRY_RUN');
  const sells = recentTrades.filter(t => t.action === 'SELL');
  const totalBought = buys.reduce((s, t) => s + (t.price || 0) * (t.size || 0), 0);
  const totalSold = sells.reduce((s, t) => s + (t.price || 0) * (t.size || 0), 0);

  const wins = recentSettlements.filter(s => s.won);
  const losses = recentSettlements.filter(s => !s.won);
  const settledPnl = recentSettlements.reduce((s, t) => s + (t.pnl || 0), 0);

  const openValue = positions.reduce((s, p) => s + (p.currentValue || 0), 0);
  const openCost = positions.reduce((s, p) => s + (p.initialValue || 0), 0);
  const unrealizedPnl = openValue - openCost;

  // Edge decay: compare average edge at entry vs actual win rate
  const entryEdges = buys.filter(t => t.edge).map(t => t.edge);
  const avgEntryEdge = entryEdges.length > 0 ? entryEdges.reduce((a, b) => a + b) / entryEdges.length : 0;

  // Build report
  const lines = [];
  const now = new Date().toISOString().slice(0, 10);

  lines.push(`# Polymarket Performance Report`);
  lines.push(`**Generated:** ${now} | **Period:** ${days} days\n`);

  lines.push(`## Summary`);
  lines.push(`| Metric | Value |`);
  lines.push(`|---|---|`);
  lines.push(`| Settled Trades | ${recentSettlements.length} (${wins.length}W / ${losses.length}L) |`);
  lines.push(`| Win Rate | ${recentSettlements.length > 0 ? ((wins.length / recentSettlements.length) * 100).toFixed(0) : '—'}% |`);
  lines.push(`| Realized P&L | $${settledPnl >= 0 ? '+' : ''}${settledPnl.toFixed(2)} |`);
  lines.push(`| Open Positions | ${positions.length} ($${openCost.toFixed(2)} invested) |`);
  lines.push(`| Unrealized P&L | $${unrealizedPnl >= 0 ? '+' : ''}${unrealizedPnl.toFixed(2)} |`);
  lines.push(`| Total P&L | $${(settledPnl + unrealizedPnl) >= 0 ? '+' : ''}${(settledPnl + unrealizedPnl).toFixed(2)} |`);
  lines.push(`| Orders Placed | ${buys.length} buys, ${sells.length} sells |`);
  lines.push(`| Capital Deployed | $${totalBought.toFixed(2)} |`);
  lines.push('');

  // Best/worst trades
  if (recentSettlements.length > 0) {
    const sorted = [...recentSettlements].sort((a, b) => b.pnl - a.pnl);
    lines.push(`## Best & Worst Trades`);
    lines.push(`- **Best:** ${sorted[0].title} → $${sorted[0].pnl >= 0 ? '+' : ''}${sorted[0].pnl.toFixed(2)} (${sorted[0].pnlPct}%)`);
    if (sorted.length > 1) {
      const worst = sorted[sorted.length - 1];
      lines.push(`- **Worst:** ${worst.title} → $${worst.pnl.toFixed(2)} (${worst.pnlPct}%)`);
    }
    lines.push('');
  }

  // Edge decay
  if (avgEntryEdge > 0 && recentSettlements.length >= 3) {
    const actualWinRate = wins.length / recentSettlements.length;
    const expectedWinRate = avgEntryEdge + 0.5; // rough: if avg edge is +10%, expected ~60% win
    lines.push(`## Edge Decay Analysis`);
    lines.push(`- Avg entry edge: ${(avgEntryEdge * 100).toFixed(1)}%`);
    lines.push(`- Expected win rate: ~${(expectedWinRate * 100).toFixed(0)}%`);
    lines.push(`- Actual win rate: ${(actualWinRate * 100).toFixed(0)}%`);
    if (actualWinRate < expectedWinRate - 0.15) {
      lines.push(`- ⚠️ **Edge appears to be decaying.** Review data sources and model assumptions.`);
    } else {
      lines.push(`- ✅ Edge is holding within expected range.`);
    }
    lines.push('');
  }

  // Open positions
  if (positions.length > 0) {
    lines.push(`## Open Positions`);
    for (const p of positions) {
      const pnl = (p.currentValue || 0) - (p.initialValue || 0);
      lines.push(`- **${p.title}** — ${p.size} shares @ ${(p.avgPrice || 0).toFixed(2)}, current ${(p.curPrice || 0).toFixed(2)} (${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)})`);
    }
    lines.push('');
  }

  // Blocked orders (risk management working)
  const blocked = recentTrades.filter(t => t.status === 'BLOCKED');
  if (blocked.length > 0) {
    lines.push(`## Risk Management`);
    lines.push(`${blocked.length} orders blocked by safety checks:`);
    for (const b of blocked.slice(-5)) {
      lines.push(`- ${b.reason || 'Unknown reason'}`);
    }
    lines.push('');
  }

  const report = lines.join('\n');
  return report;
}

// ─── CLI ───

async function main() {
  const args = process.argv.slice(2);
  const getArg = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : null; };

  const days = parseInt(getArg('--days') || '7');
  const outputFile = getArg('--output');

  const report = await generateReport(days);
  console.log(report);

  if (outputFile) {
    const dir = dirname(outputFile);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(outputFile, report);
    console.log(`\nReport saved to: ${outputFile}`);
  }
}

if (process.argv[1]?.includes('daily-review')) {
  main().catch(e => { console.error('Error:', e.message); process.exit(1); });
}
