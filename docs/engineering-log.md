# FX100 Monitor Engineering Log

This file records monitor-side architecture and implementation changes so later developers can reconstruct what changed and why.

## 2026-03-13

### Refactor: server-backed read-only monitor

- added shared monitoring domain model in `shared/monitoring.ts`
- added unified snapshot API in `server/index.ts`
- added snapshot builder in `server/data/snapshot.ts`
- moved dashboard, monitoring, alerts, and parameter pages to a single frontend data context
- removed page-local mock arrays as the primary source of truth
- documented the new architecture in `README.md`

Reason:

- the original repo was a UI demo, but each page owned its own mock state
- that made the frontend impossible to evolve into a real monitor without rewriting every screen again
- the snapshot contract stabilizes the frontend before live readers are introduced

### Upgrade: live-read priority for deployed FX100 environment

- added explicit environment config for `basefx100Sepolia0312` in `server/config/fx100.ts`
- snapshot generation now prefers live RPC reads for chain metadata and key balances
- seeded metrics remain as fallback for fields that are not yet backed by real readers

Current live-read scope:

- latest block number
- chain id
- LP vault USDC balance
- market vault collateral balance
- market vault index token balance

Planned next scope:

- DataStore-backed market state readers
- oracle / venue comparison
- funding / skew / open interest from protocol storage
- rule engine that turns raw state into incidents instead of using seeded alert derivation

### Step 1: DataStore-backed market discovery and parameter reads

- snapshot generation now discovers markets from `DataStore.MARKET_LIST` instead of relying only on embedded config
- per-market addresses now come from onchain storage (`vault`, `indexToken`, `collateralToken`)
- key market parameters now read from `DataStore` when available:
  - `POSITION_FEE_FACTOR`
  - `PRICE_IMPACT_PARAMETER`
  - `BID_ORDER_BOOK_DEPTH`
  - `ASK_ORDER_BOOK_DEPTH`
  - `MIN_COLLATERAL_FACTOR`
  - `MIN_COLLATERAL_FACTOR_FOR_LIQUIDATION`
  - `MAX_POSITION_SIZE_USD`
  - funding timestamps / funding factors / open interest in tokens
- monitoring snapshot now exposes market index and onchain market addresses to the frontend model
- runtime balances and market metadata are merged with sanity fallbacks so unset or obviously invalid onchain values do not break the monitor

Reason:

- `MarketFactory` is only the creation entrypoint; the actual market state of record is in `DataStore`
- moving market discovery to `DataStore` makes the monitor reflect the deployed environment rather than the repo config file
- fallback guards are required because not every onchain field is initialized consistently on every fork / test environment

Current outcome:

- chain / block / vault balances are live
- market discovery is live
- core market parameters are live when present, otherwise the monitor falls back to embedded defaults
- VaR / ES / alert scoring is still seeded and remains the next layer to replace with protocol-derived analytics

### Step 2: live pool / OI / funding runtime metrics for Dashboard and Alerts

- extended the snapshot with protocol-facing runtime fields:
  - pool collateral amount
  - long / short open interest in USD
  - open interest capacity
  - open interest utilization
  - pool utilization
- added `POOL_AMOUNT` and `MAX_OPEN_INTEREST` key reads from `DataStore`
- Dashboard stats now distinguish between live pool balances and utilization availability instead of forcing seeded utilization percentages
- alert generation now prefers protocol-driven runtime signals:
  - funding divergence
  - OI capacity pressure
  - pool concentration
  - falls back to volatility only when those are not present
- added guards so zero / unset OI values on fork environments do not produce false critical pool-stress incidents

Reason:

- step 1 made market discovery and static parameters onchain-aware, but the runtime incident surface was still mostly seeded
- Dashboard and Alerts need to reflect what the deployed environment is actually carrying right now, not only what the risk CSV suggests
- several fork environments have incomplete OI state, so the monitor must report missing utilization honestly instead of manufacturing alarming numbers

Observed behavior on `basefx100Sepolia0312`:

- pool balances are live
- funding comparison is live enough to drive alerts
- OI token keys currently read as zero in this environment, so utilization is reported as unavailable rather than inferred from fallback OI

### Repository hygiene: stop tracking generated artifacts

- added `.gitignore` entries for:
  - `node_modules/`
  - `dist/`
  - `*.tsbuildinfo`
  - `.DS_Store`
- removed `node_modules` and `dist` from git index with `git rm --cached`, without deleting local working files

Reason:

- generated dependencies and build outputs should not live in source control
- they were polluting diffs and obscuring actual product changes in the monitor codebase
- future commits will now isolate source changes from local install / build side effects

### Parameter provenance: field-level source labels in the UI

- extended `ParameterSnapshot` with per-field source metadata for baseline, current, and recommended values
- parameter page now renders a source badge next to each value:
  - `onchain`
  - `config`
  - `seeded`
  - `template`
  - `derived`
- current parameter values now explicitly classify whether they came from live protocol reads, config fallback, or seeded analytics
- recommended values are marked as derived and baseline values are marked as template-derived

Reason:

- parameter numbers without provenance are not actionable in a mixed-data monitor
- developers need to know whether a value is safe to trust as deployed state or only a fallback / analytical placeholder
- this also makes later replacement of seeded fields incremental, since the UI contract already encodes data trust level per field

### Step 3: replace seeded VaR / ES / risk score with runtime-derived analytics

- removed the risk CSV as the primary source for `riskScore`, `VaR`, `ES`, `tailRatio`, and alert level generation
- snapshot generation now derives risk analytics from protocol runtime state and deployed config:
  - funding divergence
  - skew
  - open-interest capacity pressure
  - pool concentration
  - environment-specific tier baselines
- added `tier` directly to the deployed market config so risk baselines do not depend on external CSV metadata
- added `analyticsSource` to each market:
  - `runtime-derived` when live open-interest state is available
  - `seeded-fallback` when the environment is missing enough runtime OI to calculate a full live signal
- dashboard and monitoring pages now show whether displayed risk metrics are runtime-derived or fallback-backed

Reason:

- the previous risk layer still depended on offline CSV outputs, which made the monitor look live while hiding a static analytics dependency
- onchain systems do not expose historical return distributions directly, so a pragmatic monitor should surface a runtime risk proxy first and label it honestly
- the new model keeps the UI stable while removing the most misleading seeded dependency from the incident and ranking layers

Current outcome:

- market ranking, alert level, VaR/ES proxy, and risk score now come from runtime-derived logic
- fallback behavior remains explicit for environments where open-interest state is not fully initialized
- the remaining seeded layer is now mostly limited to venue comparison and synthetic chart shaping, not the primary control signals

### Step 4: reduce seeded venue, oracle, and chart dependencies

- oracle price now attempts a live read from the deployed `Oracle.getPrimaryPrice(indexToken)` contract path
- price deviation now compares configured reference price against live oracle price when the oracle has an active primary price
- external funding baseline is no longer taken from a static seed; it is now a runtime-derived funding benchmark based on floor/base/range, skew, and utilization
- market chart series are no longer shaped from seeded OI-change and oracle-drift values; they are now generated from current runtime metrics and pressure signals
- alert cards now surface whether the underlying market signal is `runtime` or `fallback`

Reason:

- the previous stage removed seeded risk scoring, but venue-funding comparison, oracle drift, and chart motion still relied on demo-time constants
- those fields are acceptable as placeholders for a mock UI, but not for an operator console that needs to communicate what is actually live versus inferred
- this step narrows the remaining static dependency to reference-price fallback only when the oracle state itself is unavailable on the environment

### Step 5: add historical snapshot storage for real time-series data

- added file-backed history storage in `server/data/history.ts`
- the server now persists a compact time-series sample on each snapshot refresh under `server/.data/`
- server startup now warms the first snapshot and continues refreshing on an interval based on the environment refresh cadence
- `/api/monitoring/snapshot` now returns chart series reconstructed from stored history when enough points exist
- added `/api/monitoring/history` for raw history inspection and later tooling
- `server/.data/` is ignored from git because it is runtime state, not source

Reason:

- previous chart data was still procedurally generated from current values, which is acceptable for UI scaffolding but not for monitoring
- a monitor needs durable samples so chart movement reflects actual observations over time
- file-backed storage is the minimal pragmatic persistence layer before introducing a database or queue
