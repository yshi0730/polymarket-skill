# Data Sources for Edge Detection

Finding the right data source is your primary edge. For any market type, the key questions are:
1. **What data does the market resolve on?** (the settlement source)
2. **What higher-precision or faster-updating sources exist?** (your edge)
3. **Can you cross-validate across multiple sources?** (confidence)

## Weather
| Source | Type | Notes |
|---|---|---|
| Open-Meteo | Ensemble forecasts | Free, global, 0.1°C precision, multiple models |
| NWS (api.weather.gov) | Official forecasts | Free, US only |
| METAR/TAF (aviationweather.gov) | Airport observations | Free, global, near-real-time |
| National met agencies | Official observations | Many countries publish free APIs (search "[country] meteorological agency API") |
| Commercial forecast APIs | High-precision forecasts | Tomorrow.io, Weather Company, etc. — paid tiers offer ensemble data |

## Politics
| Source | Type | Notes |
|---|---|---|
| FiveThirtyEight | Models | Election models, historical accuracy data |
| RealClearPolitics | Poll aggregation | Simple averages, good for trend |
| 270toWin | Electoral maps | Consensus state ratings |
| Predictit | Market prices | Cross-reference for arbitrage |
| Polymarket itself | Market prices | The market you're trading against |

## Sports
| Source | Type | Notes |
|---|---|---|
| ESPN API | Stats/scores | Free, comprehensive |
| Odds API | Betting lines | Aggregates sportsbook odds |
| Injury reports | Team sites | Critical for edge |
| Weather (outdoor sports) | See weather sources | Wind, rain affect scores |

## Crypto
| Source | Type | Notes |
|---|---|---|
| CoinGecko | Prices | Free API, rate-limited |
| Glassnode | On-chain | Whale movements, exchange flows |
| Coinglass | Derivatives | Funding rates, open interest, liquidations |
| LunarCrush | Social | Social sentiment scoring |
| Fear & Greed Index | Sentiment | alternative.me/crypto |

## Finding Data Sources for Any Market Type

For custom or emerging market types, follow this process:

1. **Read the market description** — identify the exact resolution source and methodology
2. **Search for the raw data** — find the API or data feed the resolution source uses
3. **Find higher-precision alternatives** — if the market rounds data, find the un-rounded source
4. **Check update frequency** — faster updates than other traders = speed edge
5. **Cross-validate** — use 2-3 independent sources to build confidence

## General Best Practices
1. **Cross-validate** — never rely on a single source
2. **Cache aggressively** — most data doesn't change faster than every 15-30min
3. **Handle failures gracefully** — APIs go down, have fallbacks
4. **Track data freshness** — stale data = stale edge
5. **Know update schedules** — understand how often each source refreshes
