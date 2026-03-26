# Polymarket Trading Skill

An open-source skill that turns any AI agent into a prediction market trading desk on [Polymarket](https://polymarket.com). Covers the full lifecycle: wallet onboarding, market scanning, edge detection, order execution, position monitoring, risk management, and performance review.

**Who it's for:** AI agent builders who want structured, disciplined prediction market trading — not gambling.

## Prerequisites

- [Node.js](https://nodejs.org/) v18+
- [Polymarket CLI](https://github.com/Polymarket/polymarket-cli): `npm i -g polymarket`
- A funded Polygon wallet with USDC

## Installation

```bash
git clone https://github.com/yshi0730/polymarket-skill.git
cd polymarket-skill
```

No `npm install` needed — all scripts use native Node.js APIs (fetch, fs, child_process).

Copy `.env.example` to `.env` and fill in your wallet credentials (see [Quickstart](references/quickstart.md)).

## How It Works

The skill provides 9 standalone scripts that form a complete trading pipeline. A **market scanner** finds opportunities, an **edge analyzer** compares your probability model against market prices, an **order executor** places limit orders safely, and a **position manager** runs continuously in tmux to auto-exit via take-profit, stop-loss, and emergency rules. Everything is configurable via `polymarket/config.json` and environment variables. The skill guides you through developing your own edge thesis interactively, then executes it with discipline.

## Quick Start

See [`references/quickstart.md`](references/quickstart.md) for an end-to-end walkthrough.

## Full Documentation

See [`SKILL.md`](SKILL.md) for complete workflow, strategy patterns, critical rules, and API references.

## License

MIT
