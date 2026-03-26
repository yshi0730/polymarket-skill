# Quickstart: Your First Trade

End-to-end walkthrough from finding a market to exiting a position. We'll use a hypothetical politics market as our example.

## Step 1: Set Up Your Wallet

```bash
# Install the CLI if you haven't
npm i -g polymarket

# Set up your wallet — this generates a proxy wallet on Polygon
node scripts/setup-wallet.mjs
```

**Expected output:**
```
Wallet validated ✓
Proxy address: 0xABC123...
USDC balance: $250.00 on Polygon
```

**Gotcha:** Make sure you have USDC on Polygon (not Ethereum mainnet). Bridge via [Polygon Bridge](https://portal.polygon.technology/) if needed.

## Step 2: Find a Market

```bash
# Scan for active politics markets
node scripts/market-scanner.mjs --category politics
```

**Expected output:**
```
═══════════════════════════════════════
  Market Scanner — politics
═══════════════════════════════════════

Market                          | Volume     | Spread | Buckets
────────────────────────────────────────────────────────────
2028 Election Popular Vote      | $125,000   | 1.5¢   | 6
Senate Control 2026             | $89,000    | 2.1¢   | 3
...
```

Pick a market with good volume (>$10k) and tight spread (<4¢). Let's say we pick the "2028 Election Popular Vote" market with slug `us-election-2028-popular-vote`.

**Gotcha:** Low-volume markets have thin orderbooks — you won't be able to exit cleanly.

## Step 3: Analyze the Edge

```bash
# Fetch market data and analyze opportunities
node scripts/edge-analyzer.mjs --market us-election-2028-popular-vote
```

**Expected output:**
```
═══════════════════════════════════════
  Edge Analyzer
═══════════════════════════════════════

Fetching market data: us-election-2028-popular-vote...
Event: 2028 Election Popular Vote Share
Volume: $125,000
Buckets: 6

Bucket              | Market | Spread | Bid Depth | Volume
─────────────────────────────────────────────────────────────────
48-50%              |  35.0¢ |  1.5¢  |      $120 |   $25,000
50-52%              |  30.0¢ |  2.0¢  |       $95 |   $22,000
46-48%              |  15.0¢ |  2.5¢  |       $40 |   $12,000
52-54%              |  10.0¢ |  3.0¢  |       $30 |    $8,000
...

Adjacent Bucket Pairs:
Pair                          | Combined | Midpoint
───────────────────────────────────────────────────────
46-48% + 48-50%               | 50.0¢    | 48.0
48-50% + 50-52%               | 65.0¢    | 50.0
...
```

Now apply your model. Use your external data (polling averages, forecasting models, etc.) to estimate the true probability for each bucket. Compare your model probabilities against the market prices shown above — any bucket where your model probability significantly exceeds the market price is a potential edge.

**Gotcha:** Don't trade without an edge thesis. "It feels cheap" is not an edge. You need external data (polls, models, odds) that disagrees with the market.

## Step 4: Check Risk Limits

```bash
# Verify you're within portfolio limits before trading
node scripts/portfolio-gate.mjs --check
```

**Expected output:**
```
Portfolio Check:
  Total exposure: $45 / $300 max
  Open positions: 2 / 8 max
  Available: $255
  Status: ✅ CLEAR — can open new position
```

## Step 5: Place the Order

```bash
# Dry-run first!
node scripts/order-executor.mjs \
  --token "<yes_token_id_for_46-48>" \
  --side buy --price 0.15 --size 20 \
  --dry-run

# If it looks good, execute for real (remove --dry-run)
node scripts/order-executor.mjs \
  --token "<yes_token_id_for_46-48>" \
  --side buy --price 0.15 --size 20
```

**Expected output (dry-run):**
```
DRY RUN — no order placed
  Token: 0x123abc...
  Side: BUY | Price: 0.15 | Size: 20
  Total cost: $3.00
  Best ask: 0.15 | Spread: 2.5¢
  Bid depth: $40
  ✅ Passes all checks
```

**Gotcha:** Always use `--dry-run` first. Always use limit orders — never market buy on thin books. Check that the spread and bid depth pass your filters.

## Step 6: Monitor the Position

```bash
# Start the position manager in tmux (persistent)
tmux new -d -s poly-mgr 'node scripts/position-manager.mjs'

# Check on it anytime
tmux attach -t poly-mgr
```

**Expected output (running):**
```
Position Manager started
   Take-profit: +5% over avg
   Stop-loss: -20%
   Polling: 30s (active) / 300s (idle)
   Monitoring 1 positions:
     - 46-48% — 20 shares @ 0.15

[14:30:05 46-48%                   bid=0.16 +6.7% 48h]
[14:30:35 46-48%                   bid=0.17 +13.3% 47h]
```

The position manager will automatically:
- **Take profit** when VWAP exceeds your average price + threshold
- **Stop loss** when unrealized loss exceeds the threshold
- **Emergency exit** at 0.01 if the position is near-worthless close to expiry

**Gotcha:** If you close the terminal, tmux keeps running. Use `tmux ls` to see sessions and `tmux kill-session -t poly-mgr` to stop.

## Step 7: Exit the Position

The position manager handles exits automatically, but you can also sell manually:

```bash
# Manual sell
polymarket clob create-order --token "<yes_token_id>" --side sell --price 0.25 --size 20

# Cancel an open order
polymarket clob cancel <ORDER_ID>
```

## Step 8: Review Performance

```bash
node scripts/daily-review.mjs
```

**Expected output:**
```
═══════════════════════════════════════
  Daily Performance Review
═══════════════════════════════════════

  Trades today: 2
  Win rate: 100%
  PnL: +$2.00
  Max drawdown: -$0.50
  Open positions: 1
```

## Summary

| Step | Command | What it does |
|------|---------|--------------|
| 1 | `setup-wallet.mjs` | Validate wallet, check USDC balance |
| 2 | `market-scanner.mjs` | Find markets with volume and tight spreads |
| 3 | `edge-analyzer.mjs` | Analyze market structure, compare to your model |
| 4 | `portfolio-gate.mjs` | Verify you're within risk limits |
| 5 | `order-executor.mjs` | Place limit orders (dry-run first!) |
| 6 | `position-manager.mjs` | Auto-monitor and exit positions |
| 7 | Manual or auto | Take profit, stop loss, or emergency exit |
| 8 | `daily-review.mjs` | Track performance and refine strategy |

## Next Steps

- Read [`SKILL.md`](../SKILL.md) for the full workflow and strategy patterns
- Review [`risk-profiles.md`](risk-profiles.md) to pick your risk level
- Check [`lessons-learned.md`](lessons-learned.md) for battle-tested rules
