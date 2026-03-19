# Weather Markets

## How They Work
Polymarket weather markets ask: "Will the highest temperature in [City] be [X°F/°C] on [Date]?"
Markets are bucketed (e.g., 72-74°F, 75°F or higher). Each bucket is a separate YES/NO market.

## Key Edge Sources

### 1. Station Mismatch (Tier 1 Edge)
Airport weather stations ≠ city center. If the market resolves using a specific station, knowing that station's microclimate bias gives you an edge.
- Airport stations tend to be cooler (open field, elevation)
- Urban heat island pushes city center warmer
- Coastal stations may differ 2-3°C from inland

### 2. Data Precision (Tier 2 Edge)
Most forecasts report integer temperatures. If you have 0.1°C precision, you know which way the rounding goes.
- **T-group** in US METAR: 0.1°C precision (e.g., T02340178 = 23.4°C)
- **KMA** (Korea): 0.1°C airport observations
- **CWA** (Taiwan): 0.1°C station data
- Rounding rule: ≥0.5 rounds up, <0.5 rounds down

### 3. Ensemble Spread (Tier 3 Edge)
GFS ensemble (31 members via Open-Meteo) gives you uncertainty distribution. When ensemble spread is tight and centered on one bucket, that's a high-confidence trade.

## Data Pipeline
1. **Anchor**: TWC hourly forecast (most stable single-source forecast)
2. **Spread**: Open-Meteo GFS ensemble (uncertainty quantification)
3. **Blend**: Shift ensemble 50% toward TWC anchor (reduces ensemble bias)
4. **Precision**: METAR T-group / KMA / CWA for 0.1°C near-realtime
5. **Cross-validate**: NWS (US), local met agencies

## Timing
- Entry sweet spot: 12-24h before resolution date
- Closer = less drift risk, but market may already be efficient
- Peak temperature usually: 2-4pm local time (varies by city/season)
- Monitor after peak: observed max gives near-certain resolution

## Common Pitfalls
- Forecast models update at fixed times (00Z, 06Z, 12Z, 18Z) — don't over-read stale data
- Cloud cover dramatically changes peak timing
- Cold fronts can shift peak temperature by hours
- Airport microclimates differ from standard expectations
