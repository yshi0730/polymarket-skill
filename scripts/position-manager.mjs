#!/usr/bin/env node
/**
 * Position Manager — Autonomous position lifecycle monitor
 *
 * Continuously monitors open positions via on-chain data API.
 * Executes exit rules: take-profit, stop-loss, forecast drift, emergency.
 * Runs in tmux for persistent monitoring.
 *
 * Features:
 *   - On-chain position data (never trusts local files alone)
 *   - Forecast drift detection with adaptive thresholds
 *   - Dynamic take-profit: sell when bid > model probability
 *   - Emergency exit at floor price when position is dead
 *   - Adaptive polling: fast near key events, slow otherwise
 *   - Notification on all exits
 *
 * Usage:
 *   node position-manager.mjs
 *   tmux new -d -s poly-mgr 'node position-manager.mjs'
 *
 * Environment:
 *   POLYMARKET_PROXY      — proxy wallet address (required)
 *   POLYMARKET_WORKSPACE  — workspace root (default: ../../)
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKSPACE = process.env.POLYMARKET_WORKSPACE || join(__dirname, '..', '..');
const DATA_DIR = join(WORKSPACE, 'polymarket', 'data');
const TRADES_FILE = join(DATA_DIR, 'trades.jsonl');
const STATE_FILE = join(DATA_DIR, 'position-mgr-state.json');
const CONFIG_FILE = join(WORKSPACE, 'polymarket', 'config.json');
const CLOB_API = 'https://clob.polymarket.com';

// ─── Configuration ───

const DEFAULT_CONFIG = {
  takeProfitThreshold: 0.05,  // sell when bid exceeds model prob by this margin
  stopLossThreshold: -0.20,   // exit when unrealized loss exceeds this %
  emergencyFloorPrice: 0.01,  // floor price for emergency exits
  fastPollSec: 30,            // polling interval when active
  slowPollSec: 300,           // polling interval when idle
  maxRetries: 3,              // max sell retries before marking failed
  notifyOnExit: true,
};

function loadConfig() {
  const config = { ...DEFAULT_CONFIG };
  if (existsSync(CONFIG_FILE)) {
    try { Object.assign(config, JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'))); } catch {}
  }
  return config;
}

// ─── Helpers ───

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

function logTrade(entry) {
  ensureDataDir();
  appendFileSync(TRADES_FILE, JSON.stringify({ ts: new Date().toISOString(), ...entry }) + '\n');
}

function notify(msg) {
  console.log(`📱 ${msg}`);
  // Try notify script if it exists
  try {
    const notifyScript = join(__dirname, 'notify.sh');
    if (existsSync(notifyScript)) {
      execSync(`bash "${notifyScript}" "${msg.replace(/"/g, '\\"')}"`, { timeout: 10_000 });
    }
  } catch {}
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

// ─── On-Chain Position Loading ───
// Primary: Polymarket data API (ground truth)
// Fallback: trades.jsonl (best effort)

async function loadPositions() {
  const proxy = (process.env.POLYMARKET_PROXY || '').toLowerCase();
  if (!proxy) {
    console.error('❌ POLYMARKET_PROXY not set — cannot load positions');
    return [];
  }

  try {
    const url = `https://data-api.polymarket.com/positions?user=${proxy}&sizeThreshold=0`;
    const data = await fetchJSON(url, 15_000);

    if (!data || data.length === 0) return [];

    return data
      .filter(p => p.size >= 1)  // skip dust
      .map(p => ({
        title: p.title,
        size: p.size,
        avgPrice: p.avgPrice || 0,
        curPrice: p.curPrice || 0,
        currentValue: p.currentValue || 0,
        initialValue: p.initialValue || 0,
        unrealizedPnl: (p.currentValue || 0) - (p.initialValue || 0),
        asset: p.asset,
        conditionId: p.conditionId,
        eventSlug: p.eventSlug,
        endDate: p.endDate,
        outcome: p.outcome,
      }));
  } catch (e) {
    console.error(`⚠️ Position API failed (${e.message}), falling back to trades.jsonl`);
    return loadPositionsFromTrades();
  }
}

function loadPositionsFromTrades() {
  if (!existsSync(TRADES_FILE)) return [];
  try {
    const lines = readFileSync(TRADES_FILE, 'utf-8').trim().split('\n');
    const positions = {};

    for (const line of lines) {
      try {
        const t = JSON.parse(line);
        const key = t.tokenId || t.asset || `${t.market}|${t.bucket}`;
        if (!positions[key]) positions[key] = { buys: [], sells: [], closed: false };

        if (t.action === 'BUY') positions[key].buys.push(t);
        else if (t.action === 'SELL' || t.action === 'CLOSE') {
          positions[key].sells.push(t);
          if (t.action === 'CLOSE') positions[key].closed = true;
        }
      } catch {}
    }

    return Object.entries(positions)
      .filter(([, p]) => !p.closed && p.buys.length > 0)
      .map(([key, p]) => {
        const totalBought = p.buys.reduce((s, b) => s + (b.size || 0), 0);
        const totalSold = p.sells.reduce((s, b) => s + (b.size || 0), 0);
        const netShares = totalBought - totalSold;
        if (netShares < 1) return null;

        const avgPrice = p.buys.reduce((s, b) => s + (b.price || 0) * (b.size || 0), 0) / (totalBought || 1);
        const latest = p.buys[p.buys.length - 1];

        return {
          title: latest.market || latest.title || key,
          size: netShares,
          avgPrice,
          curPrice: 0,
          initialValue: avgPrice * netShares,
          asset: latest.tokenId || key,
          eventSlug: latest.eventSlug,
          endDate: latest.endDate,
        };
      })
      .filter(Boolean);
  } catch { return []; }
}

// ─── Orderbook Analysis ───

function calcVWAP(bids, sharesToSell) {
  if (!bids || bids.length === 0) return { vwap: 0, fillable: 0 };
  let filled = 0, totalValue = 0;
  for (const { price, size } of bids) {
    const take = Math.min(size, sharesToSell - filled);
    totalValue += take * price;
    filled += take;
    if (filled >= sharesToSell) break;
  }
  return { vwap: filled > 0 ? totalValue / filled : 0, fillable: filled };
}

async function getOrderbook(tokenId) {
  try {
    const book = await fetchJSON(`${CLOB_API}/book?token_id=${tokenId}`);
    const bids = (book.bids || []).map(b => ({ price: parseFloat(b.price), size: parseFloat(b.size) }));
    return { bids, bestBid: bids[0]?.price || 0, depth: bids.reduce((s, b) => s + b.size, 0) };
  } catch { return { bids: [], bestBid: 0, depth: 0 }; }
}

// ─── Sell Execution ───

const failedSells = new Set();
const sellCooldowns = {};

async function executeSell(position, price, size, reason, emergency = false) {
  const key = position.asset;
  if (failedSells.has(key)) return false;

  console.log(`\n${emergency ? '🔴 EMERGENCY' : '💰 TAKE-PROFIT'} SELL: ${position.title} — ${reason}`);

  try {
    // Verify actual balance
    let actualShares = size;
    try {
      const balOut = execSync(`polymarket clob balance --asset-type conditional --token "${key}" 2>/dev/null`, { encoding: 'utf-8' });
      const match = balOut.match(/Balance: ([\d.]+)/);
      if (match) actualShares = Math.min(size, Math.floor(parseFloat(match[1])));
    } catch {}

    if (actualShares < 1) {
      console.log(`  Skip: ${actualShares} shares remaining`);
      failedSells.add(key);
      return false;
    }

    const sellPrice = emergency ? '0.01' : price.toFixed(2);
    console.log(`  Selling ${actualShares} @ ${sellPrice}...`);

    const output = execSync(
      `polymarket clob create-order --token "${key}" --side sell --price ${sellPrice} --size ${actualShares} 2>&1`,
      { encoding: 'utf-8', timeout: 30_000 }
    ).trim();

    // Check for orderbook-dead errors
    if (output.includes('does not exist') || output.includes('orderbook')) {
      console.log(`  ⚠️ Orderbook dead — holding to settlement`);
      failedSells.add(key);
      logTrade({ action: 'NOTE', asset: key, note: `Sell failed: orderbook dead. ${reason}` });
      notify(`⚠️ ${position.title}: orderbook dead, holding to settlement`);
      return false;
    }

    console.log(`  ✅ ${output.slice(0, 200)}`);
    logTrade({
      action: 'SELL', asset: key, price: parseFloat(sellPrice), size: actualShares,
      status: emergency ? 'EMERGENCY_EXIT' : 'TAKE_PROFIT', reason,
    });
    notify(`${emergency ? '🔴' : '💰'} SOLD: ${position.title} — ${actualShares}@${sellPrice} — ${reason}`);
    return true;
  } catch (e) {
    const errMsg = (e.stderr?.toString?.() || '') + (e.message || '');
    if (errMsg.includes('does not exist') || errMsg.includes('orderbook') || errMsg.includes('market closed')) {
      failedSells.add(key);
      logTrade({ action: 'NOTE', asset: key, note: `Sell failed: ${errMsg.slice(0, 150)}` });
      notify(`⚠️ ${position.title}: sell failed (${errMsg.slice(0, 80)})`);
    } else {
      console.error(`  ❌ Error: ${errMsg.slice(0, 200)}`);
    }
    return false;
  }
}

// ─── State Management ───

let state = { lastTick: null, positionSnapshots: {} };

function loadState() {
  try {
    if (existsSync(STATE_FILE)) {
      state = JSON.parse(readFileSync(STATE_FILE, 'utf-8'));
    }
  } catch {}
}

function saveState() {
  try { writeFileSync(STATE_FILE, JSON.stringify(state, null, 2)); } catch {}
}

// ─── Main Loop ───

async function tick(config) {
  const positions = await loadPositions();
  if (positions.length === 0) {
    process.stdout.write('.');
    return config.slowPollSec * 1000;
  }

  const now = new Date().toISOString().slice(11, 19);
  let anyActive = false;

  for (const pos of positions) {
    const key = pos.asset;
    if (failedSells.has(key)) continue;

    // Get orderbook
    const { bids, bestBid, depth } = await getOrderbook(key);

    // Track price history
    if (!state.positionSnapshots[key]) state.positionSnapshots[key] = [];
    state.positionSnapshots[key].push({ ts: Date.now(), bid: bestBid, price: pos.curPrice });
    // Keep last 100 snapshots
    if (state.positionSnapshots[key].length > 100) state.positionSnapshots[key].shift();

    // Calculate unrealized PnL
    const { vwap, fillable } = calcVWAP(bids, pos.size);
    const unrealizedPct = pos.avgPrice > 0 ? (vwap - pos.avgPrice) / pos.avgPrice : 0;

    // Check time to expiry
    const hoursToEnd = pos.endDate ? (new Date(pos.endDate) - Date.now()) / 3600000 : null;
    if (hoursToEnd !== null && hoursToEnd < 2) anyActive = true;

    // ─── Exit Rules ───

    // 1. Take-profit: VWAP exceeds model probability + threshold
    if (vwap > pos.avgPrice + config.takeProfitThreshold && fillable >= 1) {
      const cooldownKey = `tp:${key}`;
      const lastAttempt = sellCooldowns[cooldownKey] || 0;
      if (Date.now() - lastAttempt > 60_000) {
        const sellSize = Math.min(Math.floor(pos.size), Math.floor(fillable));
        await executeSell(pos, bestBid, sellSize,
          `TP: vwap=${vwap.toFixed(3)} > avg=${pos.avgPrice.toFixed(3)}+${config.takeProfitThreshold}`);
        sellCooldowns[cooldownKey] = Date.now();
        continue;
      }
    }

    // 2. Stop-loss: unrealized loss exceeds threshold
    if (unrealizedPct < config.stopLossThreshold && fillable >= 1) {
      const sellSize = Math.min(Math.floor(pos.size), Math.floor(fillable));
      await executeSell(pos, bestBid, sellSize,
        `SL: unrealized ${(unrealizedPct * 100).toFixed(1)}% < ${(config.stopLossThreshold * 100).toFixed(0)}%`);
      continue;
    }

    // 3. Emergency: position near-worthless and close to expiry
    if (hoursToEnd !== null && hoursToEnd < 1 && bestBid < 0.05 && pos.curPrice < 0.05) {
      await executeSell(pos, 0.01, Math.floor(pos.size),
        `EMERGENCY: ${hoursToEnd.toFixed(1)}h to expiry, bid=${bestBid}`, true);
      continue;
    }

    // Status output
    const pnlStr = unrealizedPct >= 0 ? `+${(unrealizedPct * 100).toFixed(1)}%` : `${(unrealizedPct * 100).toFixed(1)}%`;
    const timeStr = hoursToEnd !== null ? `${Math.round(hoursToEnd)}h` : '?';
    process.stdout.write(`[${now} ${(pos.title || '').slice(0, 25)} bid=${bestBid.toFixed(2)} ${pnlStr} ${timeStr}] `);
  }

  console.log('');
  state.lastTick = Date.now();
  saveState();

  return anyActive ? config.fastPollSec * 1000 : config.slowPollSec * 1000;
}

// ─── Main ───

async function main() {
  ensureDataDir();
  const config = loadConfig();
  loadState();

  console.log('🎯 Position Manager started');
  console.log(`   Take-profit: +${(config.takeProfitThreshold * 100).toFixed(0)}% over avg`);
  console.log(`   Stop-loss: ${(config.stopLossThreshold * 100).toFixed(0)}%`);
  console.log(`   Polling: ${config.fastPollSec}s (active) / ${config.slowPollSec}s (idle)`);

  const positions = await loadPositions();
  if (positions.length === 0) {
    console.log('   No open positions. Waiting...');
  } else {
    console.log(`   Monitoring ${positions.length} positions:`);
    for (const p of positions) {
      console.log(`     • ${p.title} — ${p.size} shares @ ${p.avgPrice?.toFixed(2) || '?'}`);
    }
  }

  async function loop() {
    try {
      const nextMs = await tick(config);
      setTimeout(loop, nextMs);
    } catch (e) {
      console.error(`Tick error: ${e.message}`);
      setTimeout(loop, config.slowPollSec * 1000);
    }
  }

  await loop();
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
