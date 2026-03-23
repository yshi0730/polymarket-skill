# Polymarket API Reference

## Gamma API (Market Discovery)

Base: `https://gamma-api.polymarket.com`

| Endpoint | Description |
|---|---|
| `GET /events?slug=<slug>` | Get event by slug (includes all markets) |
| `GET /events?closed=false&active=true&limit=50&order=volume&ascending=false` | List active events by volume |
| `GET /events?tag=<tag>` | Filter by tag (weather, politics, etc.) |
| `GET /markets?slug=<slug>` | Get individual market |

### Event Response Shape
```json
{
  "id": "...", "slug": "...", "title": "...",
  "volume": "12345.67", "endDate": "2025-03-20T00:00:00Z",
  "closed": false, "active": true,
  "markets": [{
    "slug": "...", "question": "...", "groupItemTitle": "72-74°F",
    "outcomePrices": "[\"0.35\",\"0.65\"]",
    "clobTokenIds": "[\"token_yes\",\"token_no\"]",
    "volume": "5000"
  }]
}
```

## CLOB API (Trading)

Base: `https://clob.polymarket.com`

| Endpoint | Description |
|---|---|
| `GET /book?token_id=<id>` | Orderbook (bids + asks) |
| `GET /price?token_id=<id>&side=buy` | Current best price |
| `GET /midpoint?token_id=<id>` | Midpoint price |

### Orderbook Response
```json
{
  "bids": [{ "price": "0.35", "size": "100" }],
  "asks": [{ "price": "0.37", "size": "50" }]
}
```

### Order Execution (via CLI)
```bash
# Buy
polymarket clob create-order --token "<yes_token_id>" --side buy --price 0.35 --size 20

# Sell
polymarket clob create-order --token "<yes_token_id>" --side sell --price 0.50 --size 20

# Cancel
polymarket clob cancel <ORDER_ID>

# Check balance
polymarket clob balance --asset-type conditional --token "<token_id>"
```

## Data API (Positions & History)

Base: `https://data-api.polymarket.com`

| Endpoint | Description |
|---|---|
| `GET /positions?user=<proxy>&sizeThreshold=0` | All positions for wallet |

### Position Response Shape
```json
{
  "title": "Will the highest temperature...",
  "size": 50, "avgPrice": 0.35,
  "curPrice": 0.42, "currentValue": 21.0, "initialValue": 17.5,
  "asset": "token_id", "conditionId": "...", "eventSlug": "...",
  "endDate": "2025-03-20", "outcome": "Yes", "resolved": false
}
```

## Rate Limits & Best Practices

- Gamma API: ~100 req/min (generous)
- CLOB API: ~30 req/min for authenticated, ~10 for public
- Data API: ~60 req/min
- Always use timeout + retry with backoff
- Cache event data (changes slowly); refresh orderbooks per-trade
