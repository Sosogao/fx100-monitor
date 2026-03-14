# fx100-monitor

FX100 monitor is now a read-only server-backed operator console for the deployed fork environment.

## Current scope

The system is intentionally read-only. It is designed to answer three questions first:

- what markets are deployed on the target environment
- what the current protocol runtime state looks like
- which values are live, fallback, or analytically derived

This keeps the UI usable while the live reader layer is still being expanded.

## API

- `GET /api/health`
- `GET /api/monitoring/snapshot`
- `GET /api/monitoring/history`

## Snapshot contents

The snapshot returned by the backend includes:

- environment metadata
- dashboard summary
- discovered market list
- market runtime state
- risk analytics and provenance
- alert feed
- operator action log
- recovery tracking
- parameter matrices with per-field source labels

## Data sources

The backend now uses a mixed model:

- live RPC reads
- live `DataStore` market discovery
- live vault and pool balance reads
- live oracle reads where available
- runtime-derived risk and funding benchmark logic
- seeded fallback analytics only when the environment does not expose enough live state
- file-backed historical samples for time-series reconstruction

Because the target fork environment is only partially initialized for some protocol fields, the UI explicitly marks market analytics as either:

- `runtime-derived`
- `seeded-fallback`

## Architecture

- `shared/monitoring.ts`
  - shared snapshot and history types
- `server/config/fx100.ts`
  - environment configuration and deployed contract references
- `server/data/snapshot.ts`
  - live snapshot construction and fallback policy
- `server/data/history.ts`
  - file-backed history storage under `server/.data/`
- `server/index.ts`
  - API server, snapshot refresh loop, and frontend hosting
- `client/src/contexts/MonitoringContext.tsx`
  - single frontend data source
- `client/src/pages/*`
  - pages render from the normalized snapshot contract

## Historical series

Chart series now come from stored monitoring samples once enough real points exist.

- history is persisted to `server/.data/monitoring-history.<environment>.json`
- the server refresh loop appends samples on a fixed interval
- `/api/monitoring/history` exposes raw stored points for inspection

If there are not yet enough real samples, the UI will temporarily use bootstrap series. Once the server has collected enough points, charts automatically switch to real observed history.

## Vercel deployment

The repo now supports Vercel deployment with serverless API routes under `api/`.

- frontend build output: `dist/public`
- API routes: `api/health.ts`, `api/monitoring/snapshot.ts`, `api/monitoring/history.ts`
- Vercel config: `vercel.json`

Use Node 20 on Vercel. The project is configured to build the frontend with:

```bash
pnpm build:client
```

### Important runtime constraint

Vercel functions do not provide durable local disk storage. That means:

- `/api/monitoring/snapshot` works normally
- `/api/monitoring/history` works, but persistent history falls back to request-time data unless an external store is added
- local long-running history collection remains available when using `pnpm start` with the Node server

If durable historical series are required on Vercel, the next step is to move history storage to an external database or blob store.

## Development

Use Node 20.

```bash
source ~/.nvm/nvm.sh
nvm use 20
pnpm install
pnpm build
pnpm dev
```

## Runtime notes

- `server/.data/` and local `.data/` are ignored from git
- `node_modules/` and `dist/` are ignored from git
- two analytics-related Vite placeholders may warn during build if not configured:
  - `VITE_ANALYTICS_ENDPOINT`
  - `VITE_ANALYTICS_WEBSITE_ID`

## Next steps

The next engineering steps are:

1. extend live protocol readers for the remaining OI and funding state
2. replace remaining seeded fallback analytics with full runtime signals
3. integrate external venue price and funding sources
4. introduce durable persistence beyond file-backed history if the monitor becomes long-lived
