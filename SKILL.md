---
name: polymarket
description: Polymarket prediction market trading desk — wallet setup, market scanning, edge analysis, order execution, position management, and performance review.
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

## Getting Started

New here? Start with the **[Quickstart Tutorial](references/quickstart.md)** — a step-by-step walkthrough from finding a market to exiting a position, with real CLI commands and expected output at every step.

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
4. (Optional) Create `scripts/notify.sh` for exit alerts (e.g., Slack webhook, email, macOS notification)
5. **Dry-run first**: `node scripts/order-executor.mjs --dry-run ...` to validate
6. User confirms → go live

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

## Developing Your Strategy

The skill doesn't prescribe a single strategy — it helps you **build and test your own edge thesis** interactively. The workflow (Phase 2) guides you through:

1. **Identify your informational edge** — what do you know that the market doesn't? This could come from better data sources, faster updates, cross-market analysis, or domain expertise.
2. **Model the probability** — use external data to estimate the true probability of each outcome. The `edge-analyzer.mjs` provides a pluggable framework for probability models.
3. **Compare to market prices** — edge = your probability - market price. No edge = no trade.
4. **Define entry/exit rules** — codify your thesis into repeatable, testable conditions.
5. **Backtest and iterate** — use `data-logger.mjs` to collect market snapshots and validate your model before risking capital.

For bucket-based markets (temperature ranges, vote share brackets, price ranges, over/unders), pay special attention to how the market distributes probability across outcomes vs. what your model says. Markets with discrete buckets over continuous variables often have structural inefficiencies worth investigating.

Read the relevant `references/market-types/` guide for domain-specific edge sources, and `references/data-sources.md` for where to find the data that powers your model.

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
- `references/troubleshooting.md` — common issues and fixes
