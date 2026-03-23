# Weather Markets

## How They Work
Polymarket weather markets ask: "Will the highest temperature in [City] be [X°F/°C] on [Date]?"
Markets are bucketed (e.g., 72-74°F, 75°F or higher). Each bucket is a separate YES/NO market.

## Resolution
Most weather markets resolve via a specified weather data provider (often Weather Underground) using historical data for a specific station. **Always verify which station and source** — the market description specifies it.

## Key Considerations

### 1. Verify the Exact Station
Markets resolve based on a specific weather station (usually an airport ICAO code). The station listed in the market description is the only one that matters. Don't assume "city name" = city center weather.

### 2. Rounding Rules
Temperatures may be reported as integers. If the underlying measurement is continuous, understanding the rounding method (round vs truncate, unit conversion) is critical for boundary trades.

### 3. Forecast Sources
Multiple free forecast APIs exist (check `references/data-sources.md`). Compare multiple sources to build confidence. No single forecast is reliable enough to trade blindly.

### 4. Timing
- Peak temperature is usually mid-afternoon local time, but varies by geography and season
- Monitor after expected peak: observed max gives near-certain resolution
- Cloud cover and frontal passages can shift peak timing significantly

### 5. Unit Conversion
When markets use a different unit than the raw measurement (e.g., °C measurement reported as °F), the conversion and rounding can shift which bucket wins. Understand the full chain: measurement → conversion → rounding → settlement.

## Common Pitfalls
- Forecast models update at fixed intervals — don't over-read stale data between updates
- Abrupt weather changes (fronts, storms) can shift peak values by hours
- Missing or delayed data on the resolution source doesn't necessarily mean no settlement — data may appear later
- Different markets may use different resolution methodologies even on the same platform
