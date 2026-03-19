# Lessons Learned — Battle-Tested from Live Trading

These are hard-won lessons from real money on Polymarket. Every one of these cost us something to learn.

## 1. Always Use On-Chain Position Data
Local trade logs drift from reality. Orders partially fill, settlements happen, and your JSONL gets stale. The data API (`data-api.polymarket.com/positions`) is ground truth.

**Rule:** Primary = on-chain API. Local logs = backup only.

## 2. Verify Your Settlement Source
The data source you *think* resolves a market may not be the actual one. Example: Seoul weather markets — we assumed Weather Underground used airport station data, but they used a different station. The 0.5°C difference was the entire position.

**Rule:** Before trading, verify the exact resolution source and methodology. Read the market rules.

## 3. Liquidity Check Before Every Order
Check the right side of the book: **buying → check asks** (what you'll pay), **selling → check bids** (what you'll receive). You might buy in against thin asks and overpay, then find zero bids when you need to exit.

**Rule:** Check orderbook depth on both sides before any order. Depth < $10 on the side you're hitting → skip. Period.

## 4. Portfolio Hard Caps Are Mandatory
Without hard caps, one "sure thing" turns into your entire portfolio. Budget discipline prevents ruin.

**Rule:** Max total exposure, max single position, max position count. Enforce in code, not in your head.

## 5. Emergency Exits Use Floor Price
When a position is dead (outcome already determined against you), speed matters more than price. Sell at 0.01 to get whatever liquidity exists. Log the best bid as your estimated fill for P&L tracking.

**Rule:** Dead position → `price=0.01`, `size=all`. Don't wait for a better price that won't come.

## 6. Forecast Drift Monitoring Is Essential
Markets move, and your edge can disappear between entry and resolution. A forecast that supported your position at entry may shift against you hours later.

**Rule:** Continuously monitor the data source that drives your edge. If it drifts outside your position, exit.

## 7. Entry Timing Depends on Market Type
Optimal entry timing varies by market. Weather markets favor 12-24h before resolution (less forecast drift). Political markets may reward earlier entry when polls shift. Sports markets move fastest close to game time. Crypto markets can have edge at any horizon.

**Rule:** Match entry timing to your market's information cycle. Earlier entry = more drift risk but potentially larger edge. Closer to resolution = less drift but thinner edge. There is no universal "closer is better" — it depends on how your data source updates.

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
