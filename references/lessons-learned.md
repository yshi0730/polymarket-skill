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

## 10. Consider Multi-Outcome Hedging
For ranged markets (temperature, price, score), holding a single bucket is a concentrated bet. Consider whether your model's probability distribution supports spreading across multiple outcomes to reduce variance.

**Rule:** Let your probability model guide allocation across outcomes. If your model assigns meaningful probability to more than one bucket, your position sizing should reflect that.

*Note: This lesson applies to bucket markets. For binary markets, position sizing is simpler — you have one outcome to size, guided by your edge magnitude and risk profile.*

## 11. Data Precision Matters
Higher-precision data vs rounded public data can be the entire edge. If a market resolves by rounding a continuous value to an integer, accessing the un-rounded source gives you an information advantage.

**Rule:** Always seek the highest-precision data source available. The precision delta IS the edge.

## 12. Measurement Point ≠ Label
The actual measurement point matters. Official data sources may report from a location or methodology that differs systematically from what the market label implies. If a market resolves based on a specific data point, verify exactly where and how it's measured.

**Rule:** Identify the exact measurement source. Understand its biases relative to market expectations.

## 13. Bucket Markets Have Structural Inefficiencies

When a prediction market divides a continuous variable (temperature, vote share, price, score) into discrete buckets, the market's probability distribution across buckets often diverges from what a well-calibrated model would predict.

**Rule:** For any bucket-based market, compare the market's implied probability distribution against your model's distribution. Look for buckets or combinations of buckets where the market systematically misprices. The `edge-analyzer.mjs` boundary analysis view can help you spot these patterns.

**How to investigate:**
1. Build a probability model for the underlying variable using external data
2. Map your model's distribution onto the market's buckets
3. Compare your bucket probabilities to market prices
4. Look for mispricings — especially where the market's behavioral biases (anchoring on forecasts, neglecting tail outcomes) create gaps vs. your model

This applies to weather, sports, politics, crypto, and any market where continuous values are bucketed into discrete outcomes.

*Note: This lesson applies to bucket markets. For binary markets, structural inefficiency is simpler to detect — your model probability vs. market price is the entire analysis.*

## 14. Binary Markets: Speed and Information Quality Win

In binary markets (YES/NO), the edge is straightforward: your probability estimate vs. the market price. The challenge is that binary markets are often more efficient than bucket markets because the analysis is simpler for all participants.

**Where binary edge comes from:**
- **Faster information:** Getting news, data, or signals before the market prices them in
- **Better models:** More accurate probability estimates from superior data or methodology
- **Cross-market analysis:** Spotting inconsistencies between related binary markets
- **Contrarian positioning:** Markets overreact to dramatic events and underreact to slow trends

**Rule:** In binary markets, your edge decays faster because the market is simpler to analyze. Monitor your thesis continuously and exit quickly when the information advantage disappears.
