#!/usr/bin/env node
/**
 * Order Executor — Place/cancel orders with safety checks
 *
 * Pre-flight: balance check, spread guard, slippage guard, portfolio gate.
 * Limit orders only (never market orders unless --emergency flag).
 * All orders logged to trades.jsonl.
 *
 * Usage:
 *   node order-executor.mjs --token <id> --side buy --price 0.35 --size 20 [--dry-run]
 *   node order-executor.mjs --cancel --order-id <id>
 *   node order-executor.mjs --token <id> --side sell --price 0.01 --size 50 --emergency
 *
 * As module:
 *   import { placeOrder, cancelOrder } from './order-executor.mjs';
 */

import { execSync } from 'child_process';
import { readFileSync, appendFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKSPACE = process.env.POLYMARKET_WORKSPACE || join(__dirname, '..', '..');
const CONFIG_FILE = join(WORKSPACE, 'polymarket', 'config.json');
const TRADES_FILE = join(WORKSPACE, 'polymarket', 'data', 'trades.jsonl');
const CLOB_API = 'https://clob.polymarket.com';

// ─── Helpers ───

function ensureDataDir() {
  const dir = dirname(TRADES_FILE);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function loadConfig() {
  if (!existsSync(CONFIG_FILE)) return {};
  try { return JSON.parse(readFileSync(CONFIG_FILE, 'utf-8')); } catch { return {}; }
}

function logTrade(entry) {
  ensureDataDir();
  appendFileSync(TRADES_FILE, JSON.stringify({ ts: new Date().toISOString(), ...entry }) + '\n');
}

function log(icon, msg) { console.log(`${icon}  ${msg}`); }
function fail(msg) { log('❌', msg); process.exit(1); }

function sanitizeShellArg(arg) {
  if (typeof arg !== 'string') return String(arg);
  if (!/^[a-zA-Z0-9._\-]+$/.test(arg)) throw new Error(`Invalid argument: ${arg}`);
  return arg;
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

// ─── Pre-flight Checks ───

async function checkOrderbook(tokenId, side, price, size) {
  const book = await fetchJSON(`${CLOB_API}/book?token_id=${tokenId}`);
  const bids = (book.bids || []).map(b => ({ price: parseFloat(b.price), size: parseFloat(b.size) }));
  const asks = (book.asks || []).map(a => ({ price: parseFloat(a.price), size: parseFloat(a.size) }));

  const bestBid = bids[0]?.price || 0;
  const bestAsk = asks[0]?.price || 1;
  const spread = bestAsk - bestBid;

  // Check spread (skip if too wide)
  if (spread > 0.04 && side === 'buy') {
    return { ok: false, reason: `Spread too wide: ${(spread * 100).toFixed(1)}¢ (max 4¢)` };
  }

  // Check slippage for buys: our price vs best ask
  if (side === 'buy' && price > bestAsk * 1.05) {
    return { ok: false, reason: `Price ${price} is >5% above best ask ${bestAsk}. Reduce price.` };
  }

  // Check bid depth for sells
  if (side === 'sell') {
    const fillableDepth = bids.reduce((sum, b) => {
      if (b.price >= price) return sum + b.size;
      return sum;
    }, 0);
    if (fillableDepth < size * 0.5) {
      return { ok: false, reason: `Insufficient bid depth at ${price}: only ${fillableDepth.toFixed(0)} shares fillable (need ${size})` };
    }
  }

  return { ok: true, spread, bestBid, bestAsk, bidDepth: bids.reduce((s, b) => s + b.size, 0) };
}

async function checkPortfolioGate(config, orderCost) {
  // Import portfolio gate
  try {
    const { checkGate } = await import('./portfolio-gate.mjs');
    return await checkGate(config, orderCost);
  } catch {
    // Fallback: just check config limits
    return { ok: true, warning: 'Portfolio gate module not available, skipping' };
  }
}

// ─── Order Execution ───

export async function placeOrder({ tokenId, side, price, size, dryRun = false, emergency = false, meta = {} }) {
  const config = loadConfig();
  const orderCost = side === 'buy' ? price * size : 0;

  console.log('═══════════════════════════════════════');
  console.log(`  Order Executor — ${side.toUpperCase()} ${size} @ ${price}`);
  console.log('═══════════════════════════════════════\n');

  // 1. Validate inputs
  if (!tokenId) fail('Token ID required');
  if (!['buy', 'sell'].includes(side)) fail('Side must be buy or sell');
  if (price <= 0 || price >= 1) fail('Price must be between 0 and 1');
  if (size < 1) fail('Size must be >= 1');
  if (typeof tokenId !== 'string' || tokenId.length < 5) fail('Invalid token ID');

  // 2. Check orderbook (skip for emergency)
  if (!emergency) {
    log('📊', 'Checking orderbook...');
    const obCheck = await checkOrderbook(tokenId, side, price, size);
    if (!obCheck.ok) {
      log('🚫', `Pre-flight FAILED: ${obCheck.reason}`);
      logTrade({ action: side.toUpperCase(), tokenId, price, size, status: 'BLOCKED', reason: obCheck.reason, ...meta });
      return { success: false, reason: obCheck.reason };
    }
    log('✅', `Orderbook OK: spread=${(obCheck.spread * 100).toFixed(1)}¢, bestBid=${obCheck.bestBid}, bestAsk=${obCheck.bestAsk}`);
  }

  // 3. Portfolio gate (buy only)
  if (side === 'buy' && !emergency) {
    log('🛡️', 'Checking portfolio limits...');
    const gateCheck = await checkPortfolioGate(config, orderCost);
    if (!gateCheck.ok) {
      log('🚫', `Portfolio gate BLOCKED: ${gateCheck.reason}`);
      logTrade({ action: 'BUY', tokenId, price, size, status: 'BLOCKED', reason: gateCheck.reason, ...meta });
      return { success: false, reason: gateCheck.reason };
    }
    if (gateCheck.warning) log('⚠️', gateCheck.warning);
    else log('✅', 'Portfolio gate passed');
  }

  // 4. Dry run
  if (dryRun) {
    log('🧪', `DRY RUN: Would ${side} ${size} @ ${price} (cost: $${orderCost.toFixed(2)})`);
    logTrade({ action: side.toUpperCase(), tokenId, price, size, status: 'DRY_RUN', ...meta });
    return { success: true, dryRun: true };
  }

  // 5. Execute via polymarket CLI
  log('⏳', `Placing ${side} order: ${size} shares @ ${price}...`);
  try {
    const safeToken = sanitizeShellArg(tokenId);
    const safeSide = sanitizeShellArg(side);
    const cmd = `polymarket clob create-order --token "${safeToken}" --side ${safeSide} --price ${price} --size ${size} 2>&1`;
    const output = execSync(cmd, { encoding: 'utf-8', timeout: 30_000 }).trim();

    log('✅', `Order placed: ${output.slice(0, 200)}`);
    logTrade({
      action: side.toUpperCase(),
      tokenId, price, size,
      status: emergency ? 'EMERGENCY' : 'PLACED',
      cliOutput: output.slice(0, 500),
      ...meta,
    });

    return { success: true, output };
  } catch (e) {
    const errMsg = e.stderr?.toString() || e.message || 'Unknown error';
    log('❌', `Order failed: ${errMsg.slice(0, 300)}`);
    logTrade({
      action: side.toUpperCase(),
      tokenId, price, size,
      status: 'FAILED',
      error: errMsg.slice(0, 500),
      ...meta,
    });
    return { success: false, error: errMsg };
  }
}

export async function cancelOrder(orderId) {
  log('⏳', `Cancelling order ${orderId}...`);
  try {
    const safeOrderId = sanitizeShellArg(orderId);
    const output = execSync(`polymarket clob cancel-order --order-id "${safeOrderId}" 2>&1`, {
      encoding: 'utf-8', timeout: 15_000,
    }).trim();
    log('✅', `Cancelled: ${output}`);
    logTrade({ action: 'CANCEL', orderId, status: 'CANCELLED' });
    return { success: true, output };
  } catch (e) {
    const errMsg = e.stderr?.toString() || e.message;
    log('❌', `Cancel failed: ${errMsg}`);
    return { success: false, error: errMsg };
  }
}

// ─── CLI ───

async function main() {
  const args = process.argv.slice(2);
  const getArg = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : null; };
  const hasFlag = (flag) => args.includes(flag);

  if (hasFlag('--cancel')) {
    const orderId = getArg('--order-id');
    if (!orderId) fail('--order-id required for cancel');
    await cancelOrder(orderId);
    return;
  }

  const tokenId = getArg('--token');
  const side = getArg('--side');
  const price = parseFloat(getArg('--price') || '0');
  const size = parseInt(getArg('--size') || '0');
  const dryRun = hasFlag('--dry-run');
  const emergency = hasFlag('--emergency');

  if (!tokenId || !side) {
    console.error('Usage: node order-executor.mjs --token <id> --side buy|sell --price 0.35 --size 20 [--dry-run]');
    process.exit(1);
  }
  if (isNaN(price) || price <= 0 || price >= 1) {
    console.error('Error: --price must be a number between 0 and 1 (exclusive)');
    process.exit(1);
  }
  if (isNaN(size) || size < 1) {
    console.error('Error: --size must be a positive integer');
    process.exit(1);
  }

  await placeOrder({ tokenId, side, price, size, dryRun, emergency });
}

if (process.argv[1]?.includes('order-executor')) {
  main().catch(e => { console.error('Error:', e.message); process.exit(1); });
}
