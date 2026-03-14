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


### Step 6: align repo hygiene and top-level documentation

- ignored top-level `.data/` in addition to `server/.data/` so local runtime files do not leak into git status
- rewrote `README.md` to reflect the current system, not the original demo-transition state
- documented the live/fallback data model, history endpoint, storage path, and current runtime limitations

Reason:

- the README had fallen behind the actual implementation and still described the monitor as a mostly seeded transition step
- developers need one current document that matches the API surface and the data provenance rules now used by the UI
- top-level runtime artifacts should stay out of source control for the same reason as `server/.data/`: they are environment state, not code


### Step 7: add external venue price and funding benchmarks

- added external venue configuration for Binance Futures in `server/config/fx100.ts`
- snapshot generation now attempts live venue reads for per-market price and funding using the configured perp symbols
- protocol markets now expose:
  - `externalVenueName`
  - `externalPriceUsd`
  - `externalPriceDeviationPct`
  - `externalPriceSource`
  - `externalFundingSource`
- when venue reads are unavailable, funding falls back to the runtime benchmark and price falls back to oracle or config reference data
- dashboard, market monitoring, and alerts pages now surface venue comparison context instead of treating the external benchmark as an unnamed synthetic number

Reason:

- operators need to know whether protocol pricing and funding are aligned with an actual external venue, not just an inferred benchmark
- naming the venue and source status makes the comparison defensible and easier to debug when external connectivity fails
- explicit fallback rules preserve reliability without pretending that every environment always has live venue data


### Step 8: add dedicated oracle-divergence alerts

- alert generation now emits a separate `Oracle divergence` incident when protocol oracle price differs materially from the external venue price
- oracle-divergence severity is explicit:
  - `L1` at 5%+
  - `L2` at 15%+
  - `L3` at 50%+
- alert records now carry `signalSource` so the UI can show whether the incident came from protocol runtime, runtime analytics, or an external venue
- alert ordering is now severity-first so operator attention is not buried behind lower-priority incidents

Reason:

- funding divergence and oracle divergence are not the same failure mode and should not share a single alert bucket
- the current fork environment shows a very large ETH oracle-to-venue gap, which should be visible as its own incident class
- explicit signal provenance improves operator trust and makes alert interpretation faster


### Step 9: upgrade external price reference from single mark price to aggregate reference

- external venue reads now pull Binance Futures `indexPrice`, Binance Futures `markPrice`, and Binance Spot ticker price
- the monitor now derives a reference price from the median of available live prices when at least two sources are available
- external price provenance is now explicit:
  - `live-aggregate`
  - `live-index`
  - `live-spot`
  - `live-mark`
  - existing fallback modes remain for oracle/config fallback
- market snapshots now retain the individual external components (`index`, `spot`, `mark`) in addition to the chosen reference price

Reason:

- a single perp mark price is not a strong external truth source for oracle-divergence monitoring
- using a small aggregate of index, spot, and mark prices produces a more defensible comparison baseline without adding heavy infrastructure
- explicit source labels keep operator decisions grounded when only one external feed is available


### Step 10: expand live runtime usage and surface category/external-price summaries

- reduced `seeded-fallback` usage by treating inferred open-interest utilization, inferred skew, pool balance, orderbook depth, oracle price, and funding parameters as sufficient runtime signal when direct OI token counts are missing
- current funding APR now falls back to the live runtime funding benchmark instead of remaining hard-zero when base funding is unset
- alerts page now supports category filtering in addition to severity and asset filtering
- dashboard now includes per-market external reference detail cards showing aggregate, index, spot, mark, and oracle gap components

Reason:

- the monitor already had enough live protocol state to drive a useful runtime view even when direct OI token counters were absent
- leaving those markets in `seeded-fallback` understated how much live protocol context was already available
- alert operators need category-level slicing, and dashboard consumers need the external reference components visible without drilling into the market page


### Step 11: correct signed funding reads and expose protocol funding state in the market view

- corrected live funding reads to use signed `DataStore.getInt(...)` for funding floor/base/min/max factors instead of reading those keys as unsigned values
- corrected `fundingSkewEma` reads to use `DataStore.getBytes32(...)` and decode the EMA storage payload, exposing both:
  - current skew EMA percentage
  - EMA sample interval in minutes
- added live funding accumulator reads for:
  - negative funding fee per size (long / short)
  - positive funding fee per size (long / short)
- market monitoring now shows:
  - whether OI is coming from live position counters or pool/depth inference
  - whether funding is coming from protocol live state or runtime benchmark
  - funding update age
  - funding skew EMA
  - long / short funding accrual components

Reason:

- the previous implementation still left protocol funding partially opaque even though the chain already exposed the relevant state
- reading signed funding factors as unsigned values is incorrect and weakens the monitor’s claim of being live-backed
- surfacing protocol funding freshness and accumulators gives operators a way to judge whether funding behavior is coming from real protocol state or monitor-side approximation


### Step 12: add funding freshness alerts and market source coverage summary

- added a dedicated `Funding stale` alert category when protocol funding state exists but has not updated for a sustained period
- funding-staleness severity is explicit:
  - `L1` at 120m+
  - `L2` at 240m+
  - `L3` at 720m+
- the market monitoring page now shows source coverage counters for:
  - runtime-derived risk
  - live OI coverage
  - live funding coverage

Reason:

- once protocol funding state is visible, operators need a direct signal for stale funding updates instead of inferring the problem from unrelated divergence alerts
- source coverage counters make the remaining live-data gaps obvious without forcing a market-by-market inspection


### Step 13: add dashboard source coverage summary

- the dashboard now exposes the same source-coverage view that was added to the market monitoring page:
  - runtime-derived risk coverage
  - live OI coverage
  - live funding coverage

Reason:

- the top-level dashboard should show how much of the monitor is genuinely protocol-backed before an operator drills into any specific market
- in the current fork, live funding coverage is complete while live OI coverage is still zero, and that gap is important enough to surface immediately


### Step 14: add OI counter dust/missing diagnostics

- the monitor now classifies protocol OI counters per market as:
  - `usable`
  - `dust`
  - `missing`
- market snapshots now carry:
  - raw long/short OI token counters
  - a diagnostic reason string explaining whether monitor OI is trusted or inferred
- the market monitoring page now shows the OI diagnosis directly in the selected-market panel
- dashboard source coverage now distinguishes `dust` and `missing` OI coverage when live OI is unavailable

Reason:

- the current fork does expose non-zero ETH OI counters, but they are dust-sized and not reliable enough to treat as real market OI
- operators need to see why live OI coverage remains zero even though some raw counter values exist onchain


### Step 15: add OI counter missing incidents

- added a dedicated `OI counter missing` alert category when protocol position counters are not usable
- the alert now fires for both:
  - `missing` counters
  - `dust` counters
- alert descriptions reuse the same diagnostic reason shown in market monitoring

Reason:

- source coverage cards show that live OI is unavailable, but operators still need an incident-level explanation in the alert stream
- this makes the monitor explicit about why OI remains inferred even when other runtime signals are live


### Step 16: add alert quick-category filters

- alerts page now has one-click category shortcuts for:
  - `All`
  - `Oracle`
  - `Funding`
  - `OI`
- quick filters work as grouped category selectors:
  - `Funding` includes both divergence and stale incidents
  - `OI` includes the OI counter diagnosis incidents

Reason:

- once the alert stream contains multiple protocol-health categories, operators need a fast way to isolate one class of incident without opening the select menu each time


### Step 17: add dashboard data-confidence matrix

- dashboard now includes a per-market data-confidence matrix covering:
  - risk source quality
  - OI source quality
  - funding source quality
  - oracle divergence posture
  - external venue reference source

Reason:

- operators need one place to judge how trustworthy each monitor dimension is before acting on any headline metric
- this is especially important in fork environments where funding may be live while OI is still inferred and oracle divergence remains intentionally synthetic


### Step 18: add dashboard alert-category summary

- dashboard now includes an alert-category summary card that counts current incidents by category
- the summary is driven directly from the live alert stream, so it stays aligned with:
  - oracle divergence
  - funding divergence
  - funding stale
  - OI counter missing

Reason:

- once the alert model has several distinct protocol-health categories, operators need a top-level count view before drilling into the full alerts page


### Step 19: add monitoring-to-alerts deep links

- selected-market view in market monitoring now includes one-click links to:
  - oracle alerts for that market
  - funding alerts for that market
  - OI alerts for that market
- alerts page now reads query parameters on load so category and asset filters can be pre-applied from deep links

Reason:

- once the monitor exposes several distinct incident classes, operators should be able to pivot from a market state screen directly into the relevant filtered alert stream


### Step 20: add dashboard environment diagnostics

- dashboard now includes an `Environment Diagnostics` panel summarizing the current fork-level operating constraints
- diagnostics currently cover:
  - read-path status
  - oracle divergence posture
  - OI counter availability
  - funding freshness

Reason:

- operators need a concise environment-level explanation of what is wrong with the fork before interpreting any single market metric
- this reduces the need to manually reconstruct the current state from multiple cards and alert categories


### Step 21: add alerts severity and category summaries

- alerts page now includes top-level severity summary cards for:
  - `L3`
  - `L2`
  - `L1`
  - total active incidents
- alerts page also includes a live category breakdown card driven by the current incident stream

Reason:

- once the incident model is split across multiple categories and severities, operators need a fast count view before drilling into the filtered list


### Step 22: add market-level diagnostics summary bar

- market monitoring now includes a compact diagnostics summary bar in the selected-market panel
- the summary bar compresses the operator-relevant source and trust signals for the chosen market into five dimensions:
  - risk
  - OI
  - funding
  - oracle
  - venue

Reason:

- once dashboard-level diagnostics exist, operators still need the same trust signals at the point where they inspect a single market in detail
- this reduces context switching between dashboard and monitoring when triaging one market at a time


### Step 23: switch monitor environment to fresh Base fork 49b34c09

- monitoring now points at the fresh Base fork deployment documented in `Fresh fork 全量部署结果`
- switched live config to:
  - rpc `49b34c09-5fb0-4814-9440-4231f0018ac5`
  - fresh full-core addresses for DataStore / Oracle / OrderHandler / MarketFactory / LP vault / mock oracle provider
  - fresh mock token addresses for USDC / WBTC

Reason:

- the older Base Sepolia fork was running stale contract code and produced inconsistent behavior between protocol testing and monitoring
- monitor and fork testing now need to share the same fresh deployment so protocol-state debugging is done against one environment


### Step 24: add Vercel-compatible deployment path

- added Vercel serverless API routes under `api/` for:
  - `/api/health`
  - `/api/monitoring/snapshot`
  - `/api/monitoring/history`
- extracted shared API payload builders into `server/api.ts`
- kept the existing Express server for local long-running mode, but rewired it to use the same shared API logic as the Vercel handlers
- added `vercel.json` with:
  - frontend build output `dist/public`
  - Node 20 serverless runtime for API routes
  - SPA fallback rewrite for non-API routes
- split build scripts so Vercel can use `pnpm build:client` while local Node mode still uses `pnpm build`
- made history storage tolerant of serverless runtime constraints by falling back when local disk writes are unavailable
- updated `README.md` to document the Vercel deployment model and the limitation around durable history on serverless infrastructure

Reason:

- the monitor now needs a deployment path that matches the target hosting platform instead of assuming a long-running Node server
- Vercel requires static frontend output plus serverless API handlers; the old Express-only deployment model was not a clean fit
- local file-backed history is acceptable for local development, but must degrade safely on Vercel where writable disk is not durable
