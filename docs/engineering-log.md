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
  - rpc `57d381a9-4eeb-4a10-84e0-f8476c92af14`
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

## 2026-03-14

### Step 23: validate live OI on fresh Base fork with isolated traders

- aligned protocol testing and monitor assumptions to the same fresh Base fork environment:
  - `https://virtual.base.eu.rpc.tenderly.co/6b7108d1-d988-4cd3-977a-817bbde660f8`
- validated protocol-side live OI using isolated trader flows instead of reusing the deployer account
- confirmed ETH market path:
  - isolated open succeeds
  - funding reset clears stale funding blockers
  - isolated increase updates both trader position and market OI
- confirmed BTC market path:
  - isolated open succeeds when the probe uses the correct market token/oracle environment
  - funding reset is required before increase to avoid `InsufficientCollateralAmount`
  - isolated increase updates both trader position and market OI
- practical validated state on fresh Base fork:
  - ETH: open + increase causes `sizeInUsd`, `sizeInTokens`, and `OI(long)` to grow together
  - BTC: open + increase causes `sizeInUsd`, `sizeInTokens`, and `OI(long)` to grow together

Reason:

- previous monitor diagnostics showed `OI missing / inferred` because earlier probe runs mixed stale fork state, wrong order-key selection, wrong token/oracle env vars, and deployer account residue
- isolated-trader verification removes those confounders and establishes that the deployed protocol version on the fresh Base fork does update OI correctly
- monitor-side OI trust decisions for the fresh Base fork should now be based on environment state, not on the older broken probe path

### Step 24: make fresh-fork OI messaging state-driven

- added `verifiedLiveOiPath` to the fresh Base fork environment config
- updated OI counter reason text so `missing` / `dust` statuses are described as current-market snapshot conditions, not as an environment-wide protocol failure
- updated Dashboard environment diagnostics to state that the fresh-fork OI path is validated and inference only applies when the current market snapshot does not yet have material counters
- updated Monitoring selected-market copy from generic `pool/depth inferred` wording to `current snapshot inferred`, so operators do not confuse temporary market state with a broken deployment path

Reason:

- ETH and BTC isolated-trader regressions already proved that the deployed fresh Base fork updates position state and market OI correctly
- continuing to describe `missing` or `dust` counters as a broad environment problem would be misleading once the fork has validated live OI flows
- the UI should distinguish between protocol capability and current market occupancy

### Step 25: fix live OI counter scaling in monitor snapshot

- corrected live OI reads in `server/data/snapshot.ts` so `OPEN_INTEREST_IN_TOKENS` is treated as a whole-token counter instead of being scaled down by token decimals
- verified against the shared fresh Base fork that the monitor now reports live counters instead of inferred OI:
  - ETH: `12 long / 1 short`, `oiSource = live-position-counters`
  - BTC: `5 long / 1 short`, `oiSource = live-position-counters`
- this brings monitor-side OI reads into line with the validated fork regression scripts and onchain `ForkReadOI.s.sol` output

Reason:

- the protocol stores `OPEN_INTEREST_IN_TOKENS` as token counts, not token wei units
- monitor was incorrectly applying `formatUnits(..., indexTokenDecimals)`, which collapsed materially populated counters to near-zero and forced an unnecessary inferred OI fallback
- with the scaling corrected, the monitor now reflects the actual fresh-fork OI state already validated by isolated ETH/BTC regression flows

### Step 26: stabilize Vercel deployment with a committed server bundle

- switched the deployed Vercel API handlers to load a committed prebuilt bundle at `api/_lib/server-api.js`
- reverted the Vercel build back to `pnpm build:client` so deployment no longer depends on rebuilding server-side snapshot code during the Vercel build step
- documented the tradeoff in `README.md`: this is the most reliable current path for Vercel, even though it is less elegant than a dedicated server-runtime build pipeline
- documented source-label interpretation for the main fallback-sensitive fields:
  - `externalPriceSource`
  - `externalFundingSource`
  - `oiSource`

Reason:

- the Vercel deployment path repeatedly failed on server-side module resolution, runtime imports, and compiled bundle dependencies
- a committed server bundle removes that instability and gives a repeatable deployment path for the monitor today
- source labels such as `config-reference` and `runtime-benchmark` need explicit operator-facing explanation so fallback values are not mistaken for live venue data

### Step 27: add operator-visible source legend and explanations

- added a dashboard-level source legend so operators can distinguish live, derived, and fallback labels without reading repo docs
- added selected-market source explanation cards in `MonitoringEnhanced.tsx` for:
  - risk source
  - OI source
  - funding source
  - venue price source
  - venue funding source
- this makes labels such as `config-reference`, `runtime-benchmark`, and `live-position-counters` self-explanatory in the UI

Reason:

- the monitor now exposes mixed provenance intentionally, but source labels were still too implicit for operators using only the deployed UI
- critical labels must be understandable from the page itself, not only from README or engineering notes

### Step 28: add alert source and category explanations

- added an `Alert Source Guide` card to the alerts page so operators can interpret category and signal-source labels in place
- added per-alert explanatory copy for:
  - `signalSource`
  - `category`
- this removes the need to cross-reference README for common incident labels like `Funding divergence`, `Funding stale`, `Oracle divergence`, and OI diagnostics

Reason:

- once the monitor started exposing mixed live and derived alert signals, the alerts page still required repo context to interpret source labels correctly
- operators need the incident semantics directly on the page when triaging problems

### Step 29: document fork sample-book flow for monitor realism

- documented the companion `fx100-contracts_fork` sample-book command in `README.md` so operators and developers can quickly seed the shared fresh Base fork with realistic ETH/BTC activity
- documented that the sample flow uses 4 isolated traders, funds them, opens/increases positions, and is meant to create representative monitor state rather than perform deployment
- recorded the latest verified post-run OI after the sample-book execution:
  - ETH: `25 long / 1 short`
  - BTC: `9 long / 1 short`

Reason:

- once the monitor moved to live OI and live protocol reads, an almost-empty fork underutilized the UI and alert surfaces
- a documented sample-book flow makes it easy to rehydrate the shared demo fork into a more realistic state for verification, screenshots, and operator walkthroughs

### Step 30: add operator troubleshooting guide

- added `docs/operator-troubleshooting.md` to capture the minimal operational checks for `health`, `snapshot`, OI provenance, venue source labels, and alert interpretation
- linked the troubleshooting guide from `README.md` so the deployment/operator workflow is visible without scanning the engineering log
- documented that restoring demo realism on the shared fork should use `scripts/fork/run_monitor_sample_book.sh` from the contracts repo

Reason:

- once the monitor moved to live RPC reads and mixed provenance, the main failure mode became operational confusion rather than missing UI
- operators need one short document that answers: is the API live, is OI direct or inferred, are venue labels live or fallback, and how do I quickly rehydrate the shared fork

### Step 31: add monitor docs index

- added a short docs index near the top of `README.md`
- explicitly linked the main operator-facing documents:
  - `README.md`
  - `docs/operator-troubleshooting.md`
  - `docs/engineering-log.md`
- linked the companion contracts-repo sample-book command so the shared fork rehydration path is visible from the monitor repo entry point

Reason:

- the monitor docs set is now useful but spread across multiple files
- a small docs index reduces search time for the next developer or operator and makes the sample-book workflow discoverable from the repo root

### Step 32: increase onchain coverage for the parameters view

- extended `server/data/snapshot.ts` live reads to include more first-class `FX100Keys` values used by operators when checking market configuration:
  - `CONSTANT_PRICE_SPREAD`
  - `MAX_ORACLE_REF_PRICE_DEVIATION_FACTOR`
  - `MIN_POSITION_SIZE_USD`
  - `LIQUIDATION_GRACE_PERIOD_BASE`
  - plus reserve/open-interest reserve and skew/max-spread globals for future use
- changed the parameters view assembly so these fields stop falling back to template/config when live reads are available:
  - `constantSpread`
  - `maxPriceDeviation`
  - `minPosUsd`
  - `graceBaseMinutes`
- removed the old heuristic that downgraded values to `config-fallback` simply because the live onchain value matched a known deployment default

Reason:

- the parameter page was presenting a mixed model as if it were a direct contract view, which was defensible only for a subset of fields
- when a live onchain value equals the deployment default, it is still onchain; labeling it as fallback makes the page less accurate and makes coverage analysis harder

### Step 33: expose long/short reserve and skew controls in the parameters view

- extended the parameters view to surface additional live `FX100Keys` values already being read from the DataStore:
  - `MAX_PRICE_IMPACT_SPREAD`
  - `RESERVE_FACTOR` (long / short)
  - `OPEN_INTEREST_RESERVE_FACTOR` (long / short)
  - `SKEW_IMPACT_FACTOR`
  - `MIN_SKEW_IMPACT`
  - `MAX_SKEW_IMPACT`
- added explicit parameter rows for those values so the page is closer to a real operator parameter console instead of a tier-template summary
- kept template baselines for comparison, but current values now prefer the live onchain read whenever the environment is not in fallback mode

Reason:

- reserve and skew controls are core market risk knobs; hiding them while already reading them would keep the page artificially incomplete
- showing long/short reserve factors explicitly also avoids collapsing asymmetric configuration into a single averaged number without context

### Step 34: add the remaining first-pass market risk keys to the parameters view

- extended the live parameter coverage again so the parameters page now includes additional market risk keys from `FX100Keys`:
  - `POSITION_IMPACT_FACTOR` (+ / -)
  - `POSITION_IMPACT_EXPONENT_FACTOR` (+ / -)
  - `MAX_POSITION_IMPACT_FACTOR` (+ / -)
  - `LIQUIDATION_FEE_FACTOR`
  - `MAX_OPEN_INTEREST_FACTOR` (long / short)
  - `MIN_COLLATERAL_FACTOR_FOR_OPEN_INTEREST_MULTIPLIER` (long / short)
  - `MIN_COLLATERAL_USD`
- wired those values into the current parameter matrix with `onchain` source labels when live reads are available
- kept template defaults only as baseline comparison values rather than silently substituting them for current onchain values

Reason:

- after adding reserve/skew coverage, the biggest remaining gap in the market parameter view was the position-impact and collateral-threshold family of risk controls
- these are operator-relevant knobs and belong on the same page as price impact, reserve, and funding controls if the goal is to audit live market configuration

### Step 35: split protocol-global controls into a dedicated Protocol Ops page

- added a new `Protocol Ops` page and route so non-market controls are no longer forced into the market risk parameters view
- the first version of the page exposes global DataStore-backed controls in three groups:
  - `Oracle`
  - `Execution`
  - `Feature Flags`
- wired `MonitoringSnapshot` to return:
  - `protocolOpsDefinitions`
  - `protocolOps.current`
  - `protocolOps.currentSources`

Reason:

- market risk parameters and protocol-global switches are different operational domains
- separating them reduces ambiguity around what is market-specific versus what affects the entire protocol instance


## Step 36: added Keys2-backed Distribution Ops page
- Split MultichainReader and FeeDistributor keys out of market and protocol pages into a dedicated `Distribution Ops` view.
- Added live snapshot support for core scalar and environment-scoped Keys2 values so operators can inspect fee-distribution and multichain controls without mixing them into market risk parameters.


## Step 37: added Keys2 registry view
- Added a separate `Distribution Registry` page for enumerable and probe-based Keys2 mappings.
- Covered fee distributor chain registry, keeper-cost registry, and authorized-originator probes without guessing opaque address-name mappings.


## Step 38: added configurable distribution address probes
- Added configurable probe names for `FEE_DISTRIBUTOR_ADDRESS_INFO` and `FEE_DISTRIBUTOR_ADDRESS_INFO_FOR_CHAIN`.
- Default probes cover deployment-relevant names only; opaque names remain intentionally opt-in.


## Step 39: documented control-surface boundaries
- Added an explicit control-surface map to the README and operator troubleshooting guide.
- This documents the separation between market parameters, protocol-global controls, Keys2 scalar ops, and Keys2 registry/probe views.


## Step 40: surfaced parameter-research metadata in the monitor UI
- Synced the FX100Keys research into the monitor control-surface definitions.
- `Risk Parameters` and `Protocol Ops` rows now show:
  - business meaning
  - risk controlled
  - formula / runtime note
  - runtime status
  - test status
- This keeps the monitor usable as an operator-facing parameter book instead of a raw key/value table.


## Step 41: extended research metadata to distribution pages
- Added the same operator-facing research pattern to `Distribution Ops`.
- Added section-level business/runtime explanations to `Distribution Registry`.
- This keeps Keys2 surfaces readable as control surfaces instead of opaque registry dumps.


## Step 42: compacted research metadata into hover cards and doc links
- Replaced always-expanded research text blocks with compact `Explain` hover cards.
- Added direct docs links from:
  - `Risk Parameters`
  - `Protocol Ops`
  - `Distribution Ops`
  - `Distribution Registry`
- This keeps the pages denser while preserving access to the research context.


## Step 43: added market collateral aggregation
- Added `Total Market Collateral` to the dashboard and per-market `Position Collateral` to market breakdown.
- Current implementation enumerates `POSITION_LIST` onchain and sums `COLLATERAL_AMOUNT` per market. This is acceptable for early testing on small forks.
- For production-scale monitoring with large position counts, this should be replaced by an event-driven offchain indexer / materialized state pipeline instead of full onchain enumeration on each snapshot.


## Step 44: added leverage and LP cap metrics
- Added global leverage metrics to the dashboard: gross leverage, long leverage, and short leverage based on live position collateral.
- Added `Total Market Collateral` directional breakdown and per-market average leverage.
- Added LP utilization as `Total Open Interest / Total Pool Collateral` and per-market LP cap usage using reserve-factor based caps.
- This LP cap view is a monitor heuristic over current reserve-factor inputs. It is useful for early operator testing, but longer-term monitoring should rely on a dedicated event-driven state pipeline and explicit protocol-cap outputs where available.

- Step 42 (2026-03-22): consume Reader direct market risk fields (`poolUsdWithoutPnl`, `reservedUsdLong/Short`, `availableLong/ShortUsd`, `long/shortPnlToPoolFactor`) in snapshot generation so monitor no longer reconstructs these values when Reader exposes them.

- Step 43 (2026-03-22): surface direct Reader `availableLongUsd/availableShortUsd`, `poolUsdWithoutPnl`, and `long/shortPnlToPoolFactor` in Dashboard and Selected Market so operators can inspect protocol-owned reserve headroom and PnL-to-pool pressure without monitor-side reconstruction.
