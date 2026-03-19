#!/usr/bin/env node
/**
 * Wallet Setup & Validation
 * 
 * Checks polymarket CLI installation, wallet configuration, proxy wallet
 * derivation, and USDC balance on Polygon. Outputs a config skeleton
 * for the agent to fill interactively with the user.
 *
 * Usage: node setup-wallet.mjs [--check-only]
 * Exit codes: 0 = ready, 1 = action needed
 */

import { execSync } from 'child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const WORKSPACE = process.env.POLYMARKET_WORKSPACE || process.cwd();
const CONFIG_DIR = join(WORKSPACE, 'polymarket');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');
const CHECK_ONLY = process.argv.includes('--check-only');

// ─── Helpers ───

function run(cmd, opts = {}) {
  try {
    return execSync(cmd, { encoding: 'utf-8', timeout: 30_000, ...opts }).trim();
  } catch (e) {
    return null;
  }
}

function log(icon, msg) { console.log(`${icon}  ${msg}`); }
function fail(msg) { log('❌', msg); process.exit(1); }

// ─── Checks ───

async function main() {
  console.log('═══════════════════════════════════════════');
  console.log('  Polymarket Wallet Setup & Validation');
  console.log('═══════════════════════════════════════════\n');

  // 1. polymarket CLI
  const cliPath = run('which polymarket');
  if (!cliPath) {
    log('📦', 'polymarket CLI not found. Install with: npm i -g polymarket');
    if (CHECK_ONLY) process.exit(1);
    log('⏳', 'Installing polymarket CLI...');
    const installResult = run('npm i -g polymarket 2>&1');
    if (!run('which polymarket')) fail('Installation failed. Install manually: npm i -g polymarket');
    log('✅', 'polymarket CLI installed');
  } else {
    log('✅', `polymarket CLI found: ${cliPath}`);
  }

  // 2. Private key
  const pk = process.env.POLYMARKET_PRIVATE_KEY;
  if (!pk) {
    log('🔑', 'POLYMARKET_PRIVATE_KEY not set');
    console.log('\n   To create a new wallet:');
    console.log('     export POLYMARKET_PRIVATE_KEY=$(openssl rand -hex 32)');
    console.log('   Then derive proxy wallet:');
    console.log('     polymarket derive-api-key\n');
    if (CHECK_ONLY) process.exit(1);
    fail('Set POLYMARKET_PRIVATE_KEY and re-run');
  }
  log('✅', `Private key configured (${pk.slice(0, 6)}...${pk.slice(-4)})`);

  // 3. Proxy wallet
  const proxy = process.env.POLYMARKET_PROXY;
  if (!proxy) {
    log('🔗', 'POLYMARKET_PROXY not set. Attempting to derive...');
    const deriveOut = run('polymarket derive-api-key 2>&1');
    if (deriveOut) {
      console.log(`   ${deriveOut}`);
      log('⚠️', 'Set POLYMARKET_PROXY to your proxy wallet address and re-run');
    }
    if (CHECK_ONLY) process.exit(1);
    fail('Set POLYMARKET_PROXY and re-run');
  }
  log('✅', `Proxy wallet: ${proxy}`);

  // 4. USDC balance check via Polygon RPC
  let balance = null;
  try {
    const USDC_CONTRACT = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174'; // USDC on Polygon
    const balanceCalldata = `0x70a08231000000000000000000000000${proxy.replace('0x', '').toLowerCase()}`;
    const rpcPayload = JSON.stringify({
      jsonrpc: '2.0', id: 1, method: 'eth_call',
      params: [{ to: USDC_CONTRACT, data: balanceCalldata }, 'latest']
    });
    const rpcRes = run(`curl -s -X POST https://polygon-rpc.com -H "Content-Type: application/json" -d '${rpcPayload}'`);
    if (rpcRes) {
      const parsed = JSON.parse(rpcRes);
      if (parsed.result) {
        balance = parseInt(parsed.result, 16) / 1e6; // USDC has 6 decimals
      }
    }
  } catch {}

  if (balance !== null) {
    const icon = balance >= 10 ? '✅' : '⚠️';
    log(icon, `USDC balance: $${balance.toFixed(2)}`);
    if (balance < 10) {
      console.log('\n   Low balance. Fund your proxy wallet with USDC on Polygon.');
      console.log(`   Proxy address: ${proxy}`);
      console.log('   Bridge USDC from Ethereum: https://wallet.polygon.technology/\n');
    }
  } else {
    log('⚠️', 'Could not fetch USDC balance (RPC may be rate-limited)');
  }

  // 5. API keys (optional but recommended)
  const hasApiKey = !!process.env.POLYMARKET_API_KEY;
  const hasApiSecret = !!process.env.POLYMARKET_API_SECRET;
  if (hasApiKey && hasApiSecret) {
    log('✅', 'CLOB API credentials configured');
  } else {
    log('ℹ️', 'CLOB API keys not set (optional — needed for authenticated endpoints)');
    console.log('   Run: polymarket derive-api-key  → then set API_KEY, API_SECRET, PASSPHRASE');
  }

  // 6. Existing config
  if (existsSync(CONFIG_FILE)) {
    const config = JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'));
    log('✅', `Config loaded: budget=$${config.budget}, risk=${config.riskProfile}, markets=${config.marketTypes?.join(',')}`);
    console.log('\n═══════════════════════════════════════════');
    console.log('  ✅ READY TO TRADE');
    console.log('═══════════════════════════════════════════');
  } else {
    log('📝', 'No config found — creating skeleton');
    if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true });

    const skeleton = {
      budget: null,
      maxSinglePosition: null,
      maxTotalExposure: null,
      maxOpenPositions: null,
      riskProfile: null,
      marketTypes: [],
      edgeThreshold: 0.05,
      maxSpread: 0.04,
      minVolume: 1000,
      dryRun: true,
      createdAt: new Date().toISOString(),
    };
    writeFileSync(CONFIG_FILE, JSON.stringify(skeleton, null, 2));
    console.log('\n═══════════════════════════════════════════');
    console.log('  📋 CONFIG CREATED — needs user input');
    console.log(`  File: ${CONFIG_FILE}`);
    console.log('═══════════════════════════════════════════');
    console.log('\n  Ask the user for:');
    console.log('  1. Budget (total USDC to allocate)');
    console.log('  2. Market types (weather, politics, sports, crypto)');
    console.log('  3. Risk tolerance (conservative, moderate, aggressive)');
  }

  // Output structured status for agent consumption
  console.log('\n---STATUS---');
  console.log(JSON.stringify({
    cliInstalled: !!cliPath || !!run('which polymarket'),
    privateKeySet: !!pk,
    proxySet: !!proxy,
    proxy: proxy || null,
    usdcBalance: balance,
    apiKeysSet: hasApiKey && hasApiSecret,
    configExists: existsSync(CONFIG_FILE),
    ready: !!pk && !!proxy && (balance === null || balance >= 1),
  }));
  console.log('---STATUS---');
}

main().catch(e => { console.error(e); process.exit(1); });
