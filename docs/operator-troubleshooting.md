# Operator Troubleshooting Guide

This guide is for the deployed `fx100-monitor` instance. It is intentionally short and operational.

## 1. Snapshot looks empty or all values are zero

Check these endpoints first:

```bash
curl -s https://fx100-monitor.vercel.app/api/health
curl -s https://fx100-monitor.vercel.app/api/monitoring/snapshot
```

Inspect:

- `environment.readStatus`
- `environment.source`
- `dashboard.stats`
- `dashboard.notes`

Interpretation:

- `readStatus = live`
  - live RPC and protocol reads are working
- `readStatus = mixed`
  - monitor is reading live protocol state, but some analytics or venue benchmarks are still derived/fallback
- `readStatus = fallback`
  - live snapshot construction failed; inspect `environment.source` and `dashboard.notes[0]`

If you see:

- `Markets = 0`
- `Snapshot Mode = Fallback`
- `Live RPC = Unavailable`

then the problem is monitor-side API/RPC access, not protocol OI itself.

## 2. OI looks wrong

Read these fields per market:

- `oiSource`
- `oiCounterStatus`
- `oiCounterReason`
- `longOpenInterestTokens`
- `shortOpenInterestTokens`

Interpretation:

- `oiSource = live-position-counters`
  - monitor is reading `OPEN_INTEREST_IN_TOKENS` directly
- `oiSource = pool-depth-inferred`
  - direct counters were not considered sufficient for that market snapshot
- `oiCounterStatus = usable`
  - counters are materially populated and are being trusted
- `oiCounterStatus = dust` or `missing`
  - counters are not materially populated for that current snapshot

For the shared fresh Base fork, the live OI path itself has been validated. If a market later shows inferred OI again, treat that as a current-state/data-shape issue first, not a protocol failure.

## 3. Venue price/funding labels look unexpected

Important labels:

- `externalPriceSource`
  - `live-aggregate`, `live-index`, `live-spot`, `live-mark` = live venue reference
  - `config-reference` = environment reference price fallback
- `externalFundingSource`
  - `live-venue` = venue funding fetched directly
  - `runtime-benchmark` = funding comparison derived from protocol/runtime state

These are provenance markers. They are not cosmetic labels.

## 4. Alerts look inconsistent with the page state

Use the alerts page with these fields in mind:

- `category`
- `signalSource`
- grouped quick filters: `Oracle`, `Funding`, `OI`

Interpretation:

- `Funding divergence`
  - protocol funding differs from venue or runtime benchmark
- `Funding stale`
  - protocol funding state has not updated recently enough
- `Oracle divergence`
  - protocol/oracle price differs materially from venue reference
- `OI counter missing`
  - monitor cannot rely on direct position counters for that market snapshot

## 5. Restore a realistic demo state on the fork

If the shared fork is too empty for meaningful monitoring, regenerate sample positions from the contracts repo:

```bash
cd ../fx100-contracts_fork
FORK_PROFILE_ENV=scripts/deploy/base-fork/envs/fx100Base49b34c09.env \
  scripts/fork/run_monitor_sample_book.sh
```

Latest verified post-run OI from that flow:

- ETH: `25 long / 1 short`
- BTC: `9 long / 1 short`

After running it:

- refresh `/api/monitoring/snapshot`
- refresh the Dashboard / Monitoring / Alerts pages

## 6. Current standard environment

The standard shared demo environment is:

- name: `fx100Base49b34c09`
- chainId: `99917`
- fork RPC: `https://virtual.base.eu.rpc.tenderly.co/49b34c09-5fb0-4814-9440-4231f0018ac5`

If monitor and contracts are not pointed at the same environment, OI comparisons and deployment assumptions are not valid.


## Page Boundaries
- Use `/parameters` for market-level controls. If a field varies by market or tier, it belongs there.
- Use `/protocol-ops` for protocol-global controls such as oracle configuration, feature flags, and execution gas limits.
- Use `/distribution-ops` for `Keys2` scalar and current-chain FeeDistributor / MultichainReader values.
- Use `/distribution-registry` for enumerable arrays and configured probes. If a key is not enumerable onchain, it should appear there only through explicit probe configuration.
