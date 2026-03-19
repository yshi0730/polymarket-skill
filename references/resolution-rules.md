# Market Resolution Rules

## General Principles
- Markets resolve based on the **specific source** named in the market description
- Resolution is binary: YES pays $1, NO pays $0
- Voided markets return capital at entry price
- Resolution timing varies: some immediate, some up to 48h after event

## Weather Markets
- **Source:** Usually Weather Underground (wunderground.com) or specified weather service
- **Resolution:** Highest recorded temperature at the **specific station** on the date
- **Rounding:** Integer rounding (e.g., 72.4°F → 72°F, 72.5°F → 73°F)
- **Gotcha:** The station listed may not be the main airport station; verify on the resolution source
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
