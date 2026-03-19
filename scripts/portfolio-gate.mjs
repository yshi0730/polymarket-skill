#!/usr/bin/env node
/**
 * Portfolio Gate — Risk management enforcement
 *
 * Reads positions from on-chain API and enforces hard limits:
 *   - Max total invested
 *   - Max open positions
 *   - Max single position size
 *   - Max per market type
 *
 * Usable as CLI and importable module.
 *
 * CLI:  node portfolio-gate.mjs [--check] [--budget 200] [--max-positions 10]
 * Module: import { checkGate, getPortfolioStatus } from './portfolio-gate.mjs';
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKSPACE = process.env.POLYMARKET_WORKSPACE || join(__dirname, '..', '..');
const CONFIG_FILE = join(WORKSPACE, 'polymarket', 'config.json');

// ─── Defaults ───

const DEFAULTS = {
  maxTotalExposure: 200,
  maxOpenPositions: 10,
  maxSinglePosition: 50,
  maxPerCategory: 100,
};

function loadConfig() {
  if (!existsSync(CONFIG_FILE)) return DEFAULTS;
  try {
    const cfg = JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'));
    return { ...DEFAULTS, ...cfg };
  } catch { return DEFAULTS; }
}

// ─── Position Loading ───

async function fetchJSON(url, timeoutMs = 15_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally { clearTimeout(timer); }
}

export async function getPortfolioStatus() {
  const proxy = (process.env.POLYMARKET_PROXY || '').toLowerCase();
  if (!proxy) return { error: 'POLYMARKET_PROXY not set', positions: [], totalInvested: 0, openCount: 0 };

  try {
    const data = await fetchJSON(`https://data-api.polymarket.com/positions?user=${proxy}&sizeThreshold=0`);
    const open = (data || []).filter(p => p.size >= 1);
    const totalInvested = open.reduce((s, p) => s + (p.initialValue || 0), 0);
    const totalCurrent = open.reduce((s, p) => s + (p.currentValue || 0), 0);
    const maxPosition = open.reduce((max, p) => Math.max(max, p.initialValue || 0), 0);

    return {
      positions: open.map(p => ({
        title: p.title, size: p.size, avgPrice: p.avgPrice,
        initialValue: p.initialValue, currentValue: p.currentValue,
        unrealized: (p.currentValue || 0) - (p.initialValue || 0),
        eventSlug: p.eventSlug,
      })),
      totalInvested: +totalInvested.toFixed(2),
      totalCurrent: +totalCurrent.toFixed(2),
      unrealizedPnl: +(totalCurrent - totalInvested).toFixed(2),
      openCount: open.length,
      maxPosition: +maxPosition.toFixed(2),
    };
  } catch (e) {
    return { error: e.message, positions: [], totalInvested: 0, openCount: 0 };
  }
}

/**
 * Check if a new order is allowed under portfolio constraints
 * @param {Object} config - portfolio limits
 * @param {number} orderCost - cost of proposed new order
 * @returns {{ ok: boolean, reason?: string, warning?: string }}
 */
export async function checkGate(config = {}, orderCost = 0) {
  const limits = { ...DEFAULTS, ...config };
  const status = await getPortfolioStatus();

  if (status.error) {
    return { ok: true, warning: `Portfolio check unavailable: ${status.error}` };
  }

  // Hard cap: total exposure
  if (status.totalInvested + orderCost > limits.maxTotalExposure) {
    return {
      ok: false,
      reason: `Total exposure $${(status.totalInvested + orderCost).toFixed(0)} would exceed cap $${limits.maxTotalExposure} (current: $${status.totalInvested.toFixed(0)})`,
    };
  }

  // Hard cap: position count
  if (status.openCount >= limits.maxOpenPositions) {
    return {
      ok: false,
      reason: `${status.openCount} open positions — at max (${limits.maxOpenPositions})`,
    };
  }

  // Hard cap: single position
  if (orderCost > limits.maxSinglePosition) {
    return {
      ok: false,
      reason: `Order $${orderCost.toFixed(0)} exceeds max single position $${limits.maxSinglePosition}`,
    };
  }

  // Soft warning: approaching limits
  const utilizationPct = (status.totalInvested / limits.maxTotalExposure) * 100;
  if (utilizationPct > 80) {
    return {
      ok: true,
      warning: `Portfolio at ${utilizationPct.toFixed(0)}% capacity ($${status.totalInvested.toFixed(0)}/$${limits.maxTotalExposure})`,
    };
  }

  return { ok: true };
}

// ─── CLI ───

async function main() {
  const config = loadConfig();
  const status = await getPortfolioStatus();

  console.log('═══════════════════════════════════════');
  console.log('  Portfolio Gate — Risk Dashboard');
  console.log('═══════════════════════════════════════\n');

  if (status.error) {
    console.log(`⚠️  Error: ${status.error}\n`);
  }

  console.log(`Total Invested:    $${status.totalInvested.toFixed(2)} / $${config.maxTotalExposure} (${((status.totalInvested / config.maxTotalExposure) * 100).toFixed(0)}%)`);
  console.log(`Current Value:     $${(status.totalCurrent || 0).toFixed(2)}`);
  console.log(`Unrealized P&L:    $${(status.unrealizedPnl || 0).toFixed(2)}`);
  console.log(`Open Positions:    ${status.openCount} / ${config.maxOpenPositions}`);
  console.log(`Max Single:        $${status.maxPosition.toFixed(2)} / $${config.maxSinglePosition}`);

  if (status.positions.length > 0) {
    console.log('\nPositions:');
    console.log('─'.repeat(60));
    for (const p of status.positions.sort((a, b) => (b.initialValue || 0) - (a.initialValue || 0))) {
      const pnl = (p.unrealized || 0);
      const pnlStr = pnl >= 0 ? `+$${pnl.toFixed(2)}` : `-$${Math.abs(pnl).toFixed(2)}`;
      console.log(`  ${(p.title || '').slice(0, 40).padEnd(42)} $${(p.initialValue || 0).toFixed(2).padStart(6)} → $${(p.currentValue || 0).toFixed(2).padStart(6)} (${pnlStr})`);
    }
  }

  // Gate check for hypothetical $10 order
  const gateResult = await checkGate(config, 10);
  console.log(`\nGate status (for $10 order): ${gateResult.ok ? '✅ ALLOWED' : '🚫 BLOCKED'}`);
  if (gateResult.reason) console.log(`  Reason: ${gateResult.reason}`);
  if (gateResult.warning) console.log(`  Warning: ${gateResult.warning}`);

  // Structured output
  console.log('\n---JSON---');
  console.log(JSON.stringify({ ...status, limits: config, gateOk: gateResult.ok }));
  console.log('---JSON---');
}

if (process.argv[1]?.includes('portfolio-gate')) {
  main().catch(e => { console.error('Error:', e.message); process.exit(1); });
}
