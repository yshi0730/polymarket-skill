# Troubleshooting

## Wallet & Authentication

### "POLYMARKET_PRIVATE_KEY not set"
Set your wallet private key as an environment variable. Generate one with `openssl rand -hex 32` or export an existing one from your wallet.

### "POLYMARKET_PROXY not set"
After setting your private key, derive your proxy wallet: `polymarket derive-api-key`. Copy the proxy address and set it as `POLYMARKET_PROXY`.

### CLOB API authentication failures
API credentials expire periodically. Re-derive them with `polymarket derive-api-key` and update `POLYMARKET_API_KEY`, `POLYMARKET_API_SECRET`, and `POLYMARKET_PASSPHRASE`.

### "polymarket CLI not found"
Install globally: `npm i -g polymarket`. If using nvm, ensure the correct Node version is active. Verify with `which polymarket`.

## Network & API

### RPC rate limiting / balance check fails
The public Polygon RPC (`polygon-rpc.com`) has rate limits. If balance checks fail intermittently, this is normal — the script will retry. For heavy usage, consider setting up a private RPC endpoint (Alchemy, Infura, QuickNode).

### Gamma API returning empty results
The Gamma API occasionally returns empty arrays for valid slugs. The scripts retry automatically (2 retries with backoff). If persistent, check that the event slug is correct and the market is still active on polymarket.com.

### CLOB API timeouts
Orderbook queries can be slow during high-traffic periods. The default timeout is 10 seconds. If you see frequent timeouts, try during off-peak hours or increase timeout in the script.

### "HTTP 429" errors
You're hitting API rate limits. Gamma: ~100 req/min, CLOB: ~30 req/min (authenticated) or ~10 (public), Data API: ~60 req/min. Reduce polling frequency or add delays between requests.

## Trading

### Order rejected / "orderbook does not exist"
The market may have closed, resolved, or been delisted. Check the market status on polymarket.com. If it shows active, try again — the CLOB may be temporarily unavailable.

### "Spread too wide" blocking all orders
The 4¢ max spread filter is protecting you from illiquid markets. If you're confident in the trade, you can override with `--emergency` flag, but understand that wide spreads mean poor exit liquidity.

### Position manager not detecting positions
Verify `POLYMARKET_PROXY` is set to the correct proxy wallet address (lowercase, 0x-prefixed). Check that the Data API returns your positions: `curl "https://data-api.polymarket.com/positions?user=<your_proxy>&sizeThreshold=0"`.

### Orders placed but not filling
Limit orders sit on the book until matched. Check that your price is competitive — if buying, your price should be at or near the best ask. If it's too far from market, it won't fill.

## Position Manager (tmux)

### Position manager stops after terminal close
Use tmux: `tmux new -d -s poly-mgr 'node scripts/position-manager.mjs'`. Check running sessions with `tmux ls`. Reattach with `tmux attach -t poly-mgr`.

### Position manager state file corrupt
Delete `polymarket/data/position-mgr-state.json` and restart. The manager will rebuild state from the on-chain API on next tick.

## Data & Logging

### JSONL files growing too large
The data logger appends indefinitely. Periodically archive old data: `mv polymarket/data/market-history.jsonl polymarket/data/market-history-$(date +%Y%m).jsonl`.

### Inconsistency between local logs and on-chain data
Local JSONL files are best-effort records. The on-chain Data API (`data-api.polymarket.com/positions`) is always ground truth. If they diverge, trust the API. This is expected — partial fills, network issues, and settlement can cause drift.

## Polygon Network

### Low USDC balance / can't place orders
You need USDC on Polygon (not Ethereum mainnet). Bridge via the [Polygon Portal](https://portal.polygon.technology/). You also need a small amount of MATIC/POL for gas fees.

### Transaction stuck or slow
Polygon occasionally has congestion. Check [polygonscan.com](https://polygonscan.com) for network status. Most transactions confirm within seconds under normal conditions.
