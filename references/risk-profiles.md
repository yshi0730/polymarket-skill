# Risk Profiles

## Conservative
Best for: Learning, small accounts, risk-averse traders

| Parameter | Value |
|---|---|
| Max total exposure | $100 |
| Max single position | $15 |
| Max open positions | 5 |
| Min edge threshold | 10% |
| Max spread | 3¢ |
| Stop-loss | -15% |
| Take-profit | +30% |
| Position sizing | Fixed $10 per trade |
| Dry-run period | 1 week minimum |

## Moderate
Best for: Experienced traders, medium accounts

| Parameter | Value |
|---|---|
| Max total exposure | $300 |
| Max single position | $40 |
| Max open positions | 8 |
| Min edge threshold | 7% |
| Max spread | 4¢ |
| Stop-loss | -20% |
| Take-profit | EV-based (sell when bid > P(outcome)) |
| Position sizing | Edge-scaled: >15%=$25, >10%=$20, >7%=$10 |
| Dry-run period | 3 days |

## Aggressive
Best for: Experienced traders with edge, larger accounts

| Parameter | Value |
|---|---|
| Max total exposure | $500 |
| Max single position | $75 |
| Max open positions | 12 |
| Min edge threshold | 5% |
| Max spread | 4¢ |
| Stop-loss | -25% |
| Take-profit | Dynamic (model-based) |
| Position sizing | Kelly fraction (half-Kelly) |
| Dry-run period | 1 day |

## Position Sizing Guide

**Fixed:** Same $ per trade. Simple, limits damage from any single trade.

**Edge-scaled:** Larger positions for larger edges. More capital-efficient but requires accurate edge estimation.

**Kelly Criterion (half-Kelly):**
```
f = ((p * b - q) / b) / 2
where: p = model probability, q = 1-p, b = (1/market_price - 1)
```
Half-Kelly is safer than full Kelly. Never exceed max single position regardless.
