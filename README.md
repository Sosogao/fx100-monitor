# fx100-monitor

FX100 monitoring system, refactored into a read-only server-backed app.

## What changed

The original repo was a strong UI demo, but most of the monitoring logic lived in page-local mock arrays. The app now has a minimal backend shape that the frontend consumes consistently:

- `GET /api/health`
- `GET /api/monitoring/snapshot`

The snapshot contains:

- environment metadata
- dashboard summary
- normalized market risk rows
- alert feed
- operator action log
- recovery tracking
- risk parameter matrices

## Current data model

The backend is intentionally read-only and deterministic for now.

Data sources:

- `docs/risk_score_all_assets.csv`
- `docs/var_es_bilateral_calculation.csv`
- seeded runtime metrics in `server/data/snapshot.ts`

This is the right transition step before wiring live chain reads. It removes page-local mocks without prematurely locking the system to a brittle onchain adapter.

## Architecture

- `shared/monitoring.ts`
  - shared snapshot types used by server and client
- `server/data/snapshot.ts`
  - builds the normalized monitoring snapshot
- `server/index.ts`
  - serves API + frontend
- `client/src/contexts/MonitoringContext.tsx`
  - single frontend data source for all pages
- `client/src/pages/*`
  - all major pages now render from the shared snapshot

## Development

Use Node 20.

```bash
source ~/.nvm/nvm.sh
nvm use 20
pnpm install
pnpm build
pnpm dev
```

## What is still intentionally missing

This is not yet a live monitoring backend. The next step is to replace seeded runtime metrics with real readers for:

- FX100 market state
- vault balances / LP state
- open interest / skew / funding
- oracle and venue price comparisons
- alert rule evaluation against live state

The important point is that the frontend contract is now stable enough to do that without rewriting the pages again.
