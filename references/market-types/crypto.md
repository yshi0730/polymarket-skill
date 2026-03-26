# Crypto Markets

**Market structure:** Mostly binary (Will BTC hit $X by date?) with some bucket markets (price ranges, percentage changes).

## Edge Sources
1. **On-chain data** — whale movements, exchange inflows/outflows
2. **Funding rates** — perpetual swap funding indicates positioning
3. **Open interest changes** — leverage buildup = liquidation risk
4. **Social sentiment** — Fear & Greed index, social media volume
5. **Macro correlation** — crypto increasingly correlated with risk assets

## Key Principles
- Crypto prices are highly volatile — probability estimates have wide error bars
- Markets that resolve at a specific timestamp are most tradeable
- "Will BTC hit $X by date Y" markets are essentially options — price them accordingly
- Funding rates and open interest are leading indicators of short-term moves

## Data Pipeline
1. CoinGecko/CoinMarketCap for spot prices
2. Coinglass for derivatives data (funding, OI, liquidations)
3. Glassnode/IntoTheBlock for on-chain flows
4. Fear & Greed Index for sentiment baseline

## Common Pitfalls
- Don't confuse conviction with accuracy — crypto sentiment is unreliable
- Flash crashes can trigger resolution at misleading prices
- Exchange-specific prices can differ significantly
- Verify which exchange/aggregator the market uses for resolution
