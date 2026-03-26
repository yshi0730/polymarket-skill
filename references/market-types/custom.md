# Custom Market Types — Framework

**First, determine the market structure:** Is it binary (YES/NO) or bucket (multiple outcomes)? This shapes your entire analysis approach. Binary markets need a single probability estimate; bucket markets need a full probability distribution.

For any market type not covered by specific guides:

## Step 1: Understand Resolution
- What exactly triggers YES vs NO?
- What data source is used?
- What's the timeline?
- What are the edge cases / void conditions?

## Step 2: Identify Data Sources
- What public data exists about this outcome?
- How frequently is it updated?
- What's the precision/reliability?
- Are there multiple independent sources to cross-validate?

## Step 3: Build a Probability Model
- Base rate: how often does this type of outcome occur historically?
- Adjustments: what current factors shift the probability?
- Uncertainty: how confident are you in your estimate?

## Step 4: Compare to Market
- Market price = implied probability
- Your edge = your probability - market price
- Is the edge large enough to overcome spread + uncertainty?

## Step 5: Define Entry/Exit
- Entry: edge threshold, spread check, liquidity check
- Exit: take-profit (bid > model prob), stop-loss (model changes), time-based
- Emergency: floor price if outcome determined against you

## Checklist
- [ ] Read full market description and resolution rules
- [ ] Identify resolution data source
- [ ] Find 2+ independent data sources for model
- [ ] Calculate probability with uncertainty range
- [ ] Check orderbook depth and spread
- [ ] Define position size within portfolio limits
- [ ] Set up monitoring for forecast drift
