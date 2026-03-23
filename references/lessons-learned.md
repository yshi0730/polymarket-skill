# Lessons Learned — Battle-Tested Trading Rules

These lessons come from live prediction market trading. Every one cost something to learn.

## 1. Always Use On-Chain Position Data
Local trade logs drift from reality. Orders partially fill, settlements happen, and your JSONL gets stale. The data API (`data-api.polymarket.com/positions`) is ground truth.

**Rule:** Primary = on-chain API. Local logs = backup only.

## 2. Verify Your Settlement Source
The data source you *think* resolves a market may not be the actual one. Markets can resolve using a different provider, methodology, or timestamp than expected. A slight data discrepancy can cost the position.

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
Optimal entry timing varies by market. Short-horizon markets (weather, daily prices) favor entry 12-24h before resolution. Political markets may reward earlier entry when polls shift. Sports markets move fastest close to game time. Crypto markets can have edge at any horizon.

**Rule:** Match entry timing to your market's information cycle. Earlier entry = more drift risk but potentially larger edge. Closer to resolution = less drift but thinner edge. There is no universal "closer is better" — it depends on how your data source updates.

## 8. Spread Check
Wide spreads eat your edge. If the spread is 4¢ on a 10% edge, you're giving away 40% of your edge to cross the spread.

**Rules:**
- Spread >4¢ → skip
- Spread <2¢ + edge >15% → aggressive entry
- Always use limit orders at or near the ask, never market buy

## 9. Never Market Buy
Slippage on thin prediction market books is brutal. Paying significantly more than the displayed price due to thin book depth is common.

**Rule:** Limit orders only. If your limit doesn't fill, the edge wasn't real enough.

## 10. Adjacent Buckets as Hedge
For ranged markets (temperature, price, score), buying adjacent buckets reduces downside. If the market resolves at the boundary, one position wins.

**Strategy:** Buy primary bucket + adjacent bucket at ratio (e.g., 70/30). Dynamic take-profit on whichever becomes favored.

## 11. Data Precision Matters
Higher-precision data vs rounded public data can be the entire edge. If a market resolves by rounding a continuous value to an integer, accessing the un-rounded source gives you an information advantage.

**Rule:** Always seek the highest-precision data source available. The precision delta IS the edge.

## 12. Measurement Point ≠ Label
The actual measurement point matters. Official data sources may report from a location or methodology that differs systematically from what the market label implies. If a market resolves based on a specific data point, verify exactly where and how it's measured.

**Rule:** Identify the exact measurement source. Understand its biases relative to market expectations.

## 13. Boundary-Hunting: The Structural Edge in Bucket Markets

The biggest systematic mispricing in prediction markets with discrete buckets isn't about picking the right bucket — it's about **finding markets where the expected value lands near a bucket boundary**.

### Why Boundaries Create Edge

Markets psychologically over-concentrate probability on the forecast-favored bucket. But forecast error is continuous (roughly normal, σ≈1-2 units). When the expected value sits at a bucket boundary, adjacent buckets have nearly equal true probability — but the market won't price them that way.

**Example:** Model expected value = 50 (boundary of 48-50 / 51-53 buckets), σ≈2:
- P(48-50) ≈ 45%, P(51-53) ≈ 45%
- Market prices: 51-53 at 45¢, 48-50 at 20¢
- Adjacent pair cost: 65¢ for ~90% combined probability → EV = +38%

When the expected value is mid-bucket (55, center of 54-56), adjacent bucket probability drops to ~15%. No edge. **The edge exists specifically at boundaries.**

### The Strategy

1. **Scan** all markets for boundary conditions: `|expected_value - bucket_edge| < 0.5 × σ`
2. **Price** the adjacent pair: sum of both bucket market prices
3. **Calculate** true combined P using forecast distribution (normal CDF with known σ)
4. **Trade** when `pair_cost < combined_P - margin`: buy both adjacent buckets
5. **Dynamic exit**: as data updates, one bucket gains probability → sell the loser, hold the winner

### Low-Volatility Markets Are Premium

Markets where the underlying variable has low volatility (tight range) keep values near boundaries for longer. This means:
- Mispricing persists longer (more entry opportunities)
- Both buckets stay "in play" deeper into the resolution window
- Higher combined probability for the adjacent pair

High-volatility markets blow through boundaries quickly — the mispricing window is short.

### Applies to Any Bucket Market

Any prediction market with discrete outcomes over a continuous underlying variable:
- Weather: temperature buckets near forecast values
- Sports: over/under near the line number
- Politics: vote share buckets near polling averages
- Crypto: price buckets near current spot
- Any ranged market where resolution rounds a continuous value

**The edge is the boundary. Hunt it.**
