# Data Sources for Edge Detection

## Weather

### Free
| Source | API | Precision | Coverage | Notes |
|---|---|---|---|---|
| Open-Meteo | ensemble-api.open-meteo.com | 0.1°C | Global | GFS 31-member ensemble, great for uncertainty |
| NWS | api.weather.gov | 1°F | US only | Official US forecasts, reliable |
| METAR/TAF | aviationweather.gov | 1°C (0.1 via T-group) | Global airports | Aviation weather reports from airports |
| KMA | amo.kma.go.kr | 0.1°C | Korea | Korean Met Agency, excellent precision |
| CWA | opendata.cwa.gov.tw | 0.1°C | Taiwan | Central Weather Admin, high precision |
| HKO | data.weather.gov.hk | 1°C | Hong Kong | Hong Kong Observatory |

### Paid
| Source | API | Precision | Notes |
|---|---|---|---|
| Weather Company (TWC) | api.weather.com | 1°C | IBM/TWC, hourly forecasts |
| Tomorrow.io | api.tomorrow.io | 0.1°C | Good ensemble data |
| ClimaCell | api.climacell.co | 0.1°C | Now Tomorrow.io |

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

## General Best Practices
1. **Cross-validate** — never rely on a single source
2. **Cache aggressively** — most data doesn't change faster than every 15-30min
3. **Handle failures gracefully** — APIs go down, have fallbacks
4. **Track data freshness** — stale data = stale edge
5. **Know update schedules** — NWS updates 4x/day, TWC hourly, METAR every 20min-1h
