# Market Resolution Rules

## General Principles
- Markets resolve based on the **specific source** named in the market description
- Resolution is binary: YES pays $1, NO pays $0
- Voided markets return capital at entry price
- Resolution timing varies: some immediate, some up to 48h after event

## Weather Markets
- **Source:** Usually a specified weather data provider (e.g., Weather Underground) for a specific station
- **Resolution:** Highest recorded value at the **specific station** listed in the market description
- **Rounding:** Check the resolution source's rounding methodology — this varies by provider
- **Gotcha:** The station listed may differ from the "expected" location; always verify on the resolution source
- **Timing:** Usually resolves within 24h of the date ending

## Political Markets
- **Source:** Official election results, AP calls, or specified authority
- **Resolution:** Based on certified/called results, not projections
- **Timing:** Can take days-weeks for final certification
- **Gotcha:** "Will X win nomination" vs "Will X be president" have different resolution dates

## Sports Markets
- **Source:** Official league results
- **Resolution:** Final score, including overtime/shootouts unless specified
- **Gotcha:** Postponed games may void the market or extend resolution

## Crypto Markets
- **Source:** Usually CoinGecko, CoinMarketCap, or specific exchange
- **Resolution:** Price at specified timestamp
- **Gotcha:** Different exchanges show different prices; only the named source matters

## Custom Markets
- **Always read the full market description** for resolution criteria
- Look for: source, timing, edge cases, void conditions
