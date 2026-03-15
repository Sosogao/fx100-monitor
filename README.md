# fx100-monitor

FX100 monitor is now a read-only server-backed operator console for the deployed fork environment.

## Current scope

The system is intentionally read-only. It is designed to answer three questions first:

- what markets are deployed on the target environment
- what the current protocol runtime state looks like
- which values are live, fallback, or analytically derived

This keeps the UI usable while the live reader layer is still being expanded.

## Docs index


## Control Surface Map
- `Risk Parameters` (`/parameters`): per-market risk, funding, OI, impact, reserve, and collateral controls from `FX100Keys` plus explicit template/derived overlays.
- `Protocol Ops` (`/protocol-ops`): global protocol-wide controls such as oracle settings, execution gas limits, and feature flags.
- `Distribution Ops` (`/distribution-ops`): `Keys2` scalar and current-chain operational values for MultichainReader and FeeDistributor.
- `Distribution Registry` (`/distribution-registry`): enumerable `Keys2` registries and configured probe-only mappings. This intentionally excludes opaque address-name mappings unless explicitly configured.
Start here depending on what you need:

- `README.md`
  - deployment shape, data sources, Vercel runtime notes
- `docs/operator-troubleshooting.md`
  - live API triage, OI/source-label interpretation, demo fork rehydration
- `docs/engineering-log.md`
  - chronological implementation record and rationale

If you are validating the shared fresh Base fork, use the companion contracts repo flow:

```bash
cd ../fx100-contracts_fork
FORK_PROFILE_ENV=scripts/deploy/base-fork/envs/fx100Base49b34c09.env \
  scripts/fork/run_monitor_sample_book.sh
```

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
- committed server-side bundle used by the API routes: `api/_lib/server-api.js`

Use Node 20 on Vercel. The deployed frontend only needs to build the client:

```bash
pnpm build:client
```

### Why the Vercel API uses a committed bundle

The monitor's server-side snapshot logic depends on a non-trivial runtime graph (`ethers`, live RPC readers, history helpers, and mixed fallback logic). In this repo, the most reliable Vercel path is:

- build the frontend on Vercel
- commit a prebuilt server bundle at `api/_lib/server-api.js`
- have the serverless API handlers load that bundle directly

This is intentionally pragmatic. It avoids repeated Vercel failures around:

- resolving `server/api` from API handlers
- packaging server-only TypeScript modules into the function bundle
- runtime dependency mismatches around `ethers` and esbuild-generated artifacts

If we later want a cleaner deployment model, the next refactor is to replace the committed bundle with a dedicated Vercel-safe build pipeline for the API runtime.

### Important runtime constraint

Vercel functions do not provide durable local disk storage. That means:

- `/api/monitoring/snapshot` works normally
- `/api/monitoring/history` works, but persistent history falls back to request-time data unless an external store is added
- local long-running history collection remains available when using `pnpm start` with the Node server

If durable historical series are required on Vercel, the next step is to move history storage to an external database or blob store.

## Source interpretation

Several monitor fields intentionally expose whether a value is live or derived. The important ones are:

- `externalPriceSource`
  - `live-aggregate`, `live-index`, `live-spot`, `live-mark` mean the monitor obtained a live venue reference
  - `config-reference` means the venue read path was not available and the monitor fell back to the environment reference price
- `externalFundingSource`
  - `live-venue` means venue funding was fetched successfully
  - `runtime-benchmark` means the monitor derived the comparison value from protocol/runtime state instead of a live venue feed
- `oiSource`
  - `live-position-counters` means `OPEN_INTEREST_IN_TOKENS` is being used directly
  - `pool-depth-inferred` means the market snapshot did not have sufficient direct OI counters, so the monitor inferred OI from pool/depth state

Operators should read these source labels as data-provenance markers, not as UI decoration.

## Generating demo sample data

For the shared fresh Base fork environment, the monitor can be fed with additional realistic ETH/BTC positions from the contracts repo. This is the fastest way to make the dashboard, monitoring view, and alerts look like an active market instead of a nearly empty fork.

Use the companion repo command:

```bash
cd ../fx100-contracts_fork
FORK_PROFILE_ENV=scripts/deploy/base-fork/envs/fx100Base49b34c09.env \
  scripts/fork/run_monitor_sample_book.sh
```

What it does:

- creates 4 isolated traders
- funds each trader with ETH and mock USDC
- opens ETH and BTC positions across multiple accounts
- applies funding reset before selected increases
- verifies resulting position and OI growth onchain

Latest verified post-run OI on the shared fresh Base fork:

- ETH: `25 long / 1 short`
- BTC: `9 long / 1 short`

This script is intended for fork demo realism, monitor verification, and regression sampling. It should not be treated as a protocol deployment step.

## Operator troubleshooting

For live deployment checks and fallback/OI/source-label triage, use `docs/operator-troubleshooting.md`.

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
