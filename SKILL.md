---
name: polymarket
description: Professional Polymarket prediction market trading assistant. Full lifecycle: wallet onboarding, strategy design, market scanning, edge detection, order execution, position monitoring, risk management, settlement tracking, and performance review. Use when trading prediction markets, analyzing Polymarket opportunities, managing positions, or building trading strategies for any market type (weather, politics, sports, crypto, custom).
---

# Polymarket Trading Skill

Turn any AI agent into a professional prediction market trading desk.

## Quick Reference

| Script | Purpose | Run |
|---|---|---|
| `setup-wallet.mjs` | Onboard: wallet + funds + config | `node scripts/setup-wallet.mjs` |
| `market-scanner.mjs` | Find opportunities by category | `node scripts/market-scanner.mjs [--category weather] [--date YYYY-MM-DD]` |
| `edge-analyzer.mjs` | Calculate edge with external data | `node scripts/edge-analyzer.mjs --market <slug> [--data-source <src>]` |
| `order-executor.mjs` | Place/cancel orders safely | `node scripts/order-executor.mjs --token <id> --side buy --price 0.35 --size 20 [--dry-run]` |
| `position-manager.mjs` | Monitor + auto-exit (runs in tmux) | `node scripts/position-manager.mjs` |
| `portfolio-gate.mjs` | Check risk limits before trading | `node scripts/portfolio-gate.mjs [--check]` |
| `data-logger.mjs` | Append market snapshots for backtest | `node scripts/data-logger.mjs` |
| `settlement-tracker.mjs` | Track resolved markets + PnL | `node scripts/settlement-tracker.mjs` |
| `daily-review.mjs` | Generate performance report | `node scripts/daily-review.mjs` |

## Environment Variables

```
POLYMARKET_PRIVATE_KEY  # Wallet private key
POLYMARKET_PROXY        # Proxy wallet address (from polymarket CLI)
POLYMARKET_API_KEY      # CLOB API key (optional, for authenticated endpoints)
POLYMARKET_API_SECRET   # CLOB API secret
POLYMARKET_PASSPHRASE   # CLOB API passphrase
```

## Workflow

### Phase 1: Onboard (first run only)

1. Check `polymarket` CLI: `which polymarket || npm i -g polymarket`
2. Run `node scripts/setup-wallet.mjs` — validates wallet, checks USDC balance on Polygon
3. Ask user:
   - **Budget**: total USDC to allocate (suggest starting with $50-100)
   - **Market preference**: weather, politics, sports, crypto, or all
   - **Risk tolerance**: conservative / moderate / aggressive (read `references/risk-profiles.md`)
4. Save to workspace `polymarket/config.json`

### Phase 2: Strategy Design (interactive)

1. Read the relevant market-type doc from `references/market-types/` based on user preference
2. Ask: **"What's your edge? What do you know that the market doesn't?"**
   - No edge = no trade. This is non-negotiable.
3. Define entry conditions:
   - Min edge threshold (model probability - market price)
   - Min volume / max spread filters
   - Timing rules (closer to resolution = less drift risk)
4. Define exit conditions:
   - Take-profit: bid > model probability (sell EV > hold EV)
   - Stop-loss: forecast drift outside position bucket
   - Emergency: floor price 0.01 when position is dead
   - Time-based: force exit N hours before resolution if uncertain
5. Position sizing from risk profile (read `references/risk-profiles.md`)
6. Write strategy to `polymarket/strategy.json` using `assets/strategy-template.json` as base
7. Show user the complete strategy card, get confirmation

### Phase 3: Build & Deploy

1. Set up cron for data collection: `*/30 * * * * node scripts/data-logger.mjs`
2. Set up cron for scanning: `0 */4 * * * node scripts/market-scanner.mjs`
3. Start position manager: `tmux new -d -s poly-mgr 'node scripts/position-manager.mjs'`
4. **Dry-run first**: `node scripts/order-executor.mjs --dry-run ...` to validate
5. User confirms → go live

### Phase 4: Live Trading

1. Scanner finds opportunities → present as **decision card**:
   ```
   📊 OPPORTUNITY: [Market Name]
   Edge: +12.3% (model 47% vs market 35%)
   Volume: $45,000 | Spread: 2¢
   Data: [source + key datapoint]
   Suggested: BUY YES $20 @ 0.35
   Risk: [what could go wrong]
   ```
2. User confirms → `order-executor.mjs` places limit order
3. `position-manager.mjs` monitors continuously:
   - Forecast drift → alert or auto-exit
   - Take-profit triggers → limit sell
   - Emergency conditions → floor-price sell
4. All exits notify user

### Phase 5: Review & Improve

1. Run `node scripts/daily-review.mjs` (or set up daily cron)
2. Review: win rate, PnL, max drawdown, edge decay
3. Weekly: re-evaluate strategy parameters based on data
4. Update `references/lessons-learned.md` with new learnings

## Core Strategy Pattern: Boundary-Hunting

The biggest structural edge in any bucket-based prediction market (weather, sports over/under, vote share, price ranges) is **boundary mispricing**. Markets over-concentrate probability on the forecast-favored bucket while systematically underpricing adjacent buckets near the boundary.

**When to apply:** Any market where a continuous variable (score, vote %, price, any continuous metric) is bucketed into discrete outcomes.

**How it works:**
1. **Scan** for markets where the forecast/model output falls near a bucket boundary
2. **Price the pair**: buy both adjacent buckets — combined true probability is much higher than the market implies
3. **Key formula**: edge = P_combined(model) - cost(bucket_A + bucket_B). If positive, trade.
4. **Dynamic exit**: as data updates, one bucket gains → sell the loser, hold the winner

**Why it works:** Forecast errors are continuous and roughly symmetric. At a boundary, true probability splits nearly 50/50 between adjacent buckets. But bettors pile into the forecast-favored bucket, leaving the adjacent one cheap. The pair trade captures this mispricing regardless of which side resolves.

**Narrow-range markets are premium** — when the underlying variable naturally stays near boundaries (e.g., tight elections for politics, low-volatility assets for crypto), the mispricing persists longer.

Read `references/lessons-learned.md` §13 for the full derivation with examples.

## Critical Rules (from live trading)

Read `references/lessons-learned.md` for the full list. The non-negotiables:

1. **Always use on-chain position data** — never trust local logs alone
2. **Portfolio hard caps are mandatory** — no exceptions, ever
3. **Never market buy** — limit orders only (slippage on thin books is brutal)
4. **Liquidity check before every order** — no bid depth = can't exit
5. **Spread >4¢ = skip** — tight spreads only
6. **Emergency exits use floor price 0.01** — speed > price when position is dead
7. **Verify your settlement source** — the data source you assume may not be the actual one

## Market-Type References

Load the relevant reference when working with a specific market type:

- `references/market-types/weather.md` — resolution mechanics, data sources, common pitfalls
- `references/market-types/politics.md` — polls, models, timing, resolution mechanics
- `references/market-types/sports.md` — odds APIs, injury data, line movement
- `references/market-types/crypto.md` — on-chain data, sentiment, funding rates
- `references/market-types/custom.md` — framework for any market type

## Additional References

- `references/polymarket-api.md` — Gamma, CLOB, and Data API documentation
- `references/resolution-rules.md` — how different market types resolve
- `references/risk-profiles.md` — conservative/moderate/aggressive templates
- `references/data-sources.md` — comprehensive list of free/paid data APIs
