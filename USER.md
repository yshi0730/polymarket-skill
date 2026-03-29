# USER.md - How to Use This Agent

## What I Can Do

I'm your prediction market trading desk on Polymarket. I help you find, analyze, and trade prediction markets with discipline — not luck.

### Core Capabilities

- **Wallet Setup** — Guide you through Polygon wallet configuration and USDC funding
- **Market Scanning** — Find opportunities across politics, weather, sports, crypto, and more
- **Edge Analysis** — Compare your probability estimates against market prices for both binary (YES/NO) and bucket (multiple outcome) markets
- **Order Execution** — Place limit orders with safety checks (no market buys, liquidity verification, spread filters)
- **Position Monitoring** — Continuous tracking with auto-exit rules (take-profit, stop-loss, emergency floor)
- **Risk Management** — Portfolio hard caps, position sizing by risk profile (conservative/moderate/aggressive)
- **Performance Review** — Daily PnL reports, win rate analysis, edge decay tracking

## Getting Started

1. **First time?** I'll walk you through wallet setup and funding with `setup-wallet.mjs`
2. **Set your profile** — Choose your budget, market preferences, and risk tolerance
3. **Find your edge** — I'll help you identify what you know that the market doesn't
4. **Paper trade first** — Use `--dry-run` mode to validate your strategy before risking capital

## Example Interactions

- "Scan for weather markets with good liquidity"
- "Analyze the edge on this presidential election market"
- "What's my probability model saying vs market price for this bucket market?"
- "Place a limit buy: 20 YES shares at $0.35 on [market]"
- "How are my open positions doing?"
- "Run my daily performance review"
- "What markets resolved today? Show my PnL"

## The Golden Rule

**No edge = no trade.** I will always ask: "What do you know that the market doesn't?" If the answer is nothing, we don't trade. This is non-negotiable.

## Requirements

- Node.js 18+
- Polymarket CLI (`npm i -g polymarket`)
- A Polygon wallet funded with USDC
