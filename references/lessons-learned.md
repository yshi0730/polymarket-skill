# Lessons Learned — Battle-Tested from Live Trading

These are hard-won lessons from real money on Polymarket. Every one of these cost us something to learn.

## 1. Always Use On-Chain Position Data
Local trade logs drift from reality. Orders partially fill, settlements happen, and your JSONL gets stale. The data API (`data-api.polymarket.com/positions`) is ground truth.

**Rule:** Primary = on-chain API. Local logs = backup only.

## 2. Verify Your Settlement Source
The data source you *think* resolves a market may not be the actual one. Example: Seoul weather markets — we assumed Weather Underground used airport station data, but they used a different station. The 0.5°C difference was the entire position.

**Rule:** Before trading, verify the exact resolution source and methodology. Read the market rules.

## 3. Liquidity Check Before Every Order
No bid depth = can't exit. You might buy in at 35¢ and find zero bids when you need to sell. Check the orderbook *before* placing any order, and again before any exit.

**Rule:** `bidDepth < $10` → skip. Period.

## 4. Portfolio Hard Caps Are Mandatory
Without hard caps, one "sure thing" turns into your entire portfolio. Budget discipline prevents ruin.

**Rule:** Max total exposure, max single position, max position count. Enforce in code, not in your head.

## 5. Emergency Exits Use Floor Price
When a position is dead (outcome already determined against you), speed matters more than price. Sell at 0.01 to get whatever liquidity exists. Log the best bid as your estimated fill for P&L tracking.

**Rule:** Dead position → `price=0.01`, `size=all`. Don't wait for a better price that won't come.

## 6. Forecast Drift Monitoring Is Essential
Markets move, and your edge can disappear between entry and resolution. A forecast that supported your position at entry may shift against you hours later.

**Rule:** Continuously monitor the data source that drives your edge. If it drifts outside your position, exit.

## 7. Entry Timing Matters
Earlier entry = more time for forecasts to drift. Closer to resolution = less drift risk but potentially less edge (market has priced in more data).

**Rule:** Balance edge size vs time-to-resolution. For weather markets, 12-24h before resolution is the sweet spot.

## 8. Spread Check
Wide spreads eat your edge. If the spread is 4¢ on a 10% edge, you're giving away 40% of your edge to cross the spread.

**Rules:**
- Spread >4¢ → skip
- Spread <2¢ + edge >15% → aggressive entry
- Always use limit orders at or near the ask, never market buy

## 9. Never Market Buy
Slippage on thin prediction market books is brutal. We once paid 53% more than the displayed price on a market buy due to thin book depth.

**Rule:** Limit orders only. If your limit doesn't fill, the edge wasn't real enough.

## 10. Adjacent Buckets as Hedge
For ranged markets (weather, numbers), buying adjacent buckets reduces downside. If the market resolves at the boundary, one position wins.

**Strategy:** Buy primary bucket + adjacent bucket at ratio (e.g., 70/30). Dynamic take-profit on whichever becomes favored.

## 11. Data Precision Matters
0.1°C precision (T-group in METAR, KMA data) vs 1°C integer rounding can be the entire edge. If you're trading a market that rounds to integers, knowing the decimal gives you an information advantage.

**Rule:** Always seek the highest-precision data source available. The precision delta IS the edge.

## 12. Station ≠ City
Airport temperatures differ from city center. Weather stations at airports (which is what most data sources report) can differ by 1-3°C from downtown. If the market resolves based on a specific station, know which one.

**Rule:** Identify the exact measurement station. Map it. Understand its microclimate biases.
