import { useMemo } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, RefreshCw, ShieldCheck, Siren, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useMonitoring } from "@/contexts/MonitoringContext";

function toneClass(tone: string) {
  if (tone === "critical") return "text-destructive";
  if (tone === "warning") return "text-yellow-500";
  if (tone === "good") return "text-primary";
  return "text-foreground";
}

function alertBadge(level: string) {
  if (level === "l3") return "bg-destructive/20 text-destructive border-destructive/40";
  if (level === "l2") return "bg-orange-500/20 text-orange-500 border-orange-500/40";
  if (level === "l1") return "bg-yellow-500/20 text-yellow-500 border-yellow-500/40";
  return "bg-primary/20 text-primary border-primary/30";
}

function analyticsBadge(source: string) {
  return source === "runtime-derived"
    ? "bg-primary/20 text-primary border-primary/30"
    : "bg-yellow-500/20 text-yellow-500 border-yellow-500/30";
}

function confidenceBadge(tone: "good" | "warning" | "critical") {
  if (tone === "critical") return "bg-destructive/20 text-destructive border-destructive/40";
  if (tone === "warning") return "bg-yellow-500/20 text-yellow-500 border-yellow-500/40";
  return "bg-primary/20 text-primary border-primary/30";
}

function sourceLegendTone(kind: "live" | "derived" | "fallback") {
  if (kind === "fallback") return "bg-yellow-500/20 text-yellow-500 border-yellow-500/40";
  if (kind === "derived") return "bg-orange-500/20 text-orange-500 border-orange-500/40";
  return "bg-primary/20 text-primary border-primary/30";
}

function marketAlertTone(level: string) {
  if (level === "l3") return "critical" as const;
  if (level === "l2") return "warning" as const;
  return "good" as const;
}

function metricTone(value: number) {
  if (value > 0) return "warning" as const;
  if (value < 0) return "critical" as const;
  return "good" as const;
}

const sourceLegend = [
  {
    label: "live-position-counters / live-venue / live-aggregate",
    kind: "live" as const,
    detail: "Direct protocol counters or external venue reads are available and used as-is.",
  },
  {
    label: "runtime-derived / runtime-benchmark",
    kind: "derived" as const,
    detail: "Computed from live protocol state when a direct venue/reference series is not available.",
  },
  {
    label: "config-reference / seeded-fallback / pool-depth-inferred",
    kind: "fallback" as const,
    detail: "A configured or inferred substitute is being used. Treat this as lower-confidence operator context.",
  },
];

export default function Dashboard() {
  const { snapshot, loading, error, refresh } = useMonitoring();
  const priority = useMemo(() => snapshot?.dashboard.priorityMarkets ?? [], [snapshot]);
  const aggregate = useMemo(() => {
    const markets = snapshot?.markets ?? [];
    const totalOi = markets.reduce((sum, market) => sum + market.openInterestUsd, 0);
    const totalLongOi = markets.reduce((sum, market) => sum + market.longOpenInterestUsd, 0);
    const totalShortOi = markets.reduce((sum, market) => sum + market.shortOpenInterestUsd, 0);
    const totalPoolCollateral = Array.from(new Map(markets.map((market) => [market.vault, market.poolCollateralAmount])).values()).reduce((sum, value) => sum + value, 0);
    const totalMarketCollateral = markets.reduce((sum, market) => sum + market.positionCollateralUsd, 0);
    const totalLongCollateral = markets.reduce((sum, market) => sum + market.longPositionCollateralUsd, 0);
    const totalShortCollateral = markets.reduce((sum, market) => sum + market.shortPositionCollateralUsd, 0);
    const sidedOi = Math.max(totalLongOi, totalShortOi);
    const grossLeverage = totalMarketCollateral > 0 ? totalOi / totalMarketCollateral : 0;
    const longLeverage = totalLongCollateral > 0 ? totalLongOi / totalLongCollateral : 0;
    const shortLeverage = totalShortCollateral > 0 ? totalShortOi / totalShortCollateral : 0;
    const grossLpUtilizationPct = totalPoolCollateral > 0 ? (totalOi / totalPoolCollateral) * 100 : 0;
    const sidedLpUtilizationPct = totalPoolCollateral > 0 ? (sidedOi / totalPoolCollateral) * 100 : 0;
    const netSkewUsd = totalLongOi - totalShortOi;
    const netSkewPct = totalOi > 0 ? (netSkewUsd / totalOi) * 100 : 0;
    const fundingStress = markets.filter((market) => Math.max(market.longFundingAprPct, market.shortFundingAprPct) > market.externalFundingAprPct).length;
    const oracleStress = markets.filter((market) => market.externalPriceSource.startsWith("live-") && market.externalPriceDeviationPct >= 5).length;
    const activeAlerts = snapshot?.alerts.length ?? 0;
    const worstLpCapUsagePct = markets.reduce((worst, market) => {
      const longCapUsd = market.poolCollateralAmount * (market.reserveFactorLongPct / 100);
      const shortCapUsd = market.poolCollateralAmount * (market.reserveFactorShortPct / 100);
      const longUsage = longCapUsd > 0 ? (market.longOpenInterestUsd / longCapUsd) * 100 : 0;
      const shortUsage = shortCapUsd > 0 ? (market.shortOpenInterestUsd / shortCapUsd) * 100 : 0;
      return Math.max(worst, longUsage, shortUsage);
    }, 0);
    return { totalOi, totalLongOi, totalShortOi, totalPoolCollateral, totalMarketCollateral, totalLongCollateral, totalShortCollateral, sidedOi, grossLeverage, longLeverage, shortLeverage, grossLpUtilizationPct, sidedLpUtilizationPct, worstLpCapUsagePct, netSkewUsd, netSkewPct, fundingStress, oracleStress, activeAlerts };
  }, [snapshot]);
  const marketBreakdown = useMemo(() => (snapshot?.markets ?? []).map((market) => ({
    symbol: market.symbol,
    displayName: market.displayName,
    alertLevel: market.alertLevel,
    openInterestUsd: market.openInterestUsd,
    longOpenInterestUsd: market.longOpenInterestUsd,
    shortOpenInterestUsd: market.shortOpenInterestUsd,
    longFundingAprPct: market.longFundingAprPct,
    shortFundingAprPct: market.shortFundingAprPct,
    longSharePct: market.longSharePct,
    shortSharePct: market.shortSharePct,
    skewPct: market.skewPct,
    externalPriceDeviationPct: market.externalPriceDeviationPct,
    riskScore: market.riskScore,
    watchStatus: market.watchStatus,
    positionCollateralUsd: market.positionCollateralUsd,
    longPositionCollateralUsd: market.longPositionCollateralUsd,
    shortPositionCollateralUsd: market.shortPositionCollateralUsd,
    reserveFactorLongPct: market.reserveFactorLongPct,
    reserveFactorShortPct: market.reserveFactorShortPct,
    poolCollateralAmount: market.poolCollateralAmount,
  })), [snapshot]);
  const sourceCoverage = useMemo(() => ({
    runtimeRisk: snapshot?.markets.filter((market) => market.analyticsSource === "runtime-derived").length ?? 0,
    liveOi: snapshot?.markets.filter((market) => market.oiSource === "live-position-counters").length ?? 0,
    dustOi: snapshot?.markets.filter((market) => market.oiCounterStatus === "dust").length ?? 0,
    missingOi: snapshot?.markets.filter((market) => market.oiCounterStatus === "missing").length ?? 0,
    liveFunding: snapshot?.markets.filter((market) => market.fundingSignalSource === "live-funding-state").length ?? 0,
    total: snapshot?.markets.length ?? 0,
  }), [snapshot]);
  const confidenceMatrix = useMemo(() => snapshot?.markets.map((market) => ({
    symbol: market.symbol,
    cells: [
      {
        label: "Risk",
        value: market.analyticsSource === "runtime-derived" ? "runtime-derived" : "seeded-fallback",
        tone: market.analyticsSource === "runtime-derived" ? "good" : "warning",
      },
      {
        label: "OI",
        value: market.oiSource === "live-position-counters" ? "live counters" : market.oiCounterStatus,
        tone: market.oiSource === "live-position-counters" ? "good" : market.oiCounterStatus === "dust" ? "warning" : "critical",
      },
      {
        label: "Funding",
        value: market.fundingSignalSource === "live-funding-state" ? "protocol live" : "benchmark",
        tone: market.fundingSignalSource === "live-funding-state" ? "good" : "warning",
      },
      {
        label: "Oracle",
        value: market.externalPriceDeviationPct >= 50 ? "severe gap" : market.externalPriceDeviationPct >= 15 ? "elevated gap" : "tracked",
        tone: market.externalPriceDeviationPct >= 50 ? "critical" : market.externalPriceDeviationPct >= 15 ? "warning" : "good",
      },
      {
        label: "Venue",
        value: market.externalPriceSource,
        tone: market.externalPriceSource.startsWith("live-") ? "good" : "warning",
      },
    ] as Array<{ label: string; value: string; tone: "good" | "warning" | "critical" }>,
  })) ?? [], [snapshot]);
  const alertCategorySummary = useMemo(() => {
    const counts = new Map<string, number>();
    for (const alert of snapshot?.alerts ?? []) {
      counts.set(alert.category, (counts.get(alert.category) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([category, count]) => ({ category, count }))
      .sort((left, right) => right.count - left.count);
  }, [snapshot]);
  const environmentDiagnostics = useMemo(() => {
    const items: Array<{ title: string; detail: string; tone: "good" | "warning" | "critical" }> = [];
    const severeOracleMarkets = snapshot?.markets.filter((market) => market.externalPriceDeviationPct >= 50) ?? [];
    const elevatedOracleMarkets = snapshot?.markets.filter((market) => market.externalPriceDeviationPct >= 15) ?? [];
    const missingOiMarkets = snapshot?.markets.filter((market) => market.oiCounterStatus === "missing") ?? [];
    const staleFundingMarkets = snapshot?.markets.filter((market) => (market.fundingUpdatedAgoMinutes ?? 0) >= 120) ?? [];

    items.push({
      title: "Read Path",
      detail: snapshot?.environment.readStatus === "fallback"
        ? "RPC live reads are unavailable; monitor is operating on fallback values."
        : `RPC live reads are active on chain ${snapshot?.environment.chainId ?? "unknown"} at block ${snapshot?.environment.blockNumber ?? "unknown"}.`,
      tone: snapshot?.environment.readStatus === "fallback" ? "critical" : snapshot?.environment.readStatus === "mixed" ? "warning" : "good",
    });

    items.push({
      title: "Oracle Divergence",
      detail: severeOracleMarkets.length > 0
        ? `${severeOracleMarkets.map((market) => `${market.symbol} ${market.externalPriceDeviationPct.toFixed(2)}%`).join(", ")} are in severe divergence against external venue references.`
        : elevatedOracleMarkets.length > 0
          ? `${elevatedOracleMarkets.map((market) => `${market.symbol} ${market.externalPriceDeviationPct.toFixed(2)}%`).join(", ")} show elevated oracle divergence.`
          : "No markets currently exceed the elevated oracle divergence threshold.",
      tone: severeOracleMarkets.length > 0 ? "critical" : elevatedOracleMarkets.length > 0 ? "warning" : "good",
    });

    items.push({
      title: "OI Counters",
      detail: missingOiMarkets.length > 0
        ? `${missingOiMarkets.map((market) => market.symbol).join(", ")} currently have missing protocol OI counters; the fresh-fork OI path is validated, so OI remains inferred only for the current snapshot.`
        : "All monitored markets currently have usable live OI counters.",
      tone: missingOiMarkets.length > 0 ? "critical" : "good",
    });

    items.push({
      title: "Funding Freshness",
      detail: staleFundingMarkets.length > 0
        ? `${staleFundingMarkets.map((market) => `${market.symbol} ${market.fundingUpdatedAgoMinutes?.toFixed(1)}m`).join(", ")} have stale funding updates.`
        : "No markets currently show stale funding state.",
      tone: staleFundingMarkets.length > 0 ? "warning" : "good",
    });

    return items;
  }, [snapshot]);

  if (loading && !snapshot) {
    return <div className="text-sm text-muted-foreground">Loading monitoring snapshot...</div>;
  }

  if (error || !snapshot) {
    return (
      <Card className="bg-card/50 border-destructive/30 tech-border">
        <CardHeader>
          <CardTitle className="text-destructive">Snapshot unavailable</CardTitle>
          <CardDescription>{error ?? "No monitoring data returned."}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={() => void refresh()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-primary uppercase">Command Center</h2>
          <p className="text-muted-foreground">
            {snapshot.environment.network} · {snapshot.environment.readStatus} reads · updated {new Date(snapshot.generatedAt).toLocaleString()}
            {snapshot.environment.blockNumber ? ` · block ${snapshot.environment.blockNumber}` : ""}.
          </p>
        </div>
        <div className="flex gap-2">
          <Badge variant="outline" className="border-primary/30 text-primary">
            {snapshot.environment.name}
          </Badge>
          <Button variant="outline" className="border-primary/40 text-primary hover:bg-primary/10" onClick={() => void refresh()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-4">
        <Card className="bg-card/50 border-primary/20 tech-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Open Interest</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">${Intl.NumberFormat("en-US").format(Math.round(aggregate.totalOi))}</div>
            <p className="mt-1 text-xs text-muted-foreground">All-market aggregate open interest across the current snapshot.</p>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-primary/20 tech-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Long / Short OI</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">${Intl.NumberFormat("en-US").format(Math.round(aggregate.totalLongOi))} / ${Intl.NumberFormat("en-US").format(Math.round(aggregate.totalShortOi))}</div>
            <p className="mt-1 text-xs text-muted-foreground">Directional OI aggregated across all configured markets.</p>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-primary/20 tech-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Leverage</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">{aggregate.grossLeverage.toFixed(2)}x</div>
            <p className="mt-1 text-xs text-muted-foreground">Long {aggregate.longLeverage.toFixed(2)}x · Short {aggregate.shortLeverage.toFixed(2)}x based on live position collateral.</p>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-primary/20 tech-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Pool Collateral</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">${Intl.NumberFormat("en-US").format(Math.round(aggregate.totalPoolCollateral))}</div>
            <p className="mt-1 text-xs text-muted-foreground">Deduplicated LP vault collateral across shared market vaults.</p>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-primary/20 tech-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Market Collateral</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">${Intl.NumberFormat("en-US").format(Math.round(aggregate.totalMarketCollateral))}</div>
            <p className="mt-1 text-xs text-muted-foreground">Long ${Intl.NumberFormat("en-US").format(Math.round(aggregate.totalLongCollateral))} · Short ${Intl.NumberFormat("en-US").format(Math.round(aggregate.totalShortCollateral))}</p>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-primary/20 tech-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">LP Utilization (Side)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">{aggregate.sidedLpUtilizationPct.toFixed(1)}%</div>
            <p className="mt-1 text-xs text-muted-foreground">max(Long OI, Short OI) / Total Pool Collateral. Gross {aggregate.grossLpUtilizationPct.toFixed(1)}% · Worst cap usage {aggregate.worstLpCapUsagePct.toFixed(1)}%.</p>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-primary/20 tech-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Markets Above Venue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${aggregate.fundingStress > 0 ? "text-yellow-500" : "text-primary"}`}>{aggregate.fundingStress}/{snapshot.markets.length}</div>
            <p className="mt-1 text-xs text-muted-foreground">Active alerts {aggregate.activeAlerts} · Oracle stress {aggregate.oracleStress}.</p>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-card/50 border-primary/20 tech-border">
        <CardHeader>
          <CardTitle className="text-primary">Source Legend</CardTitle>
          <CardDescription>Interpret live, derived, and fallback labels consistently across dashboard, monitoring, and alerts.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          {sourceLegend.map((item) => (
            <div key={item.label} className="rounded border border-border bg-background/40 p-3">
              <Badge variant="outline" className={sourceLegendTone(item.kind)}>{item.kind}</Badge>
              <div className="mt-2 text-sm font-medium text-foreground">{item.label}</div>
              <div className="mt-1 text-xs text-muted-foreground">{item.detail}</div>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card className="bg-card/50 border-primary/20 tech-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Runtime Risk Coverage</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">{sourceCoverage.runtimeRisk}/{sourceCoverage.total}</div>
            <p className="mt-1 text-xs text-muted-foreground">Markets currently driven by protocol/runtime analytics instead of seeded fallback.</p>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-primary/20 tech-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Live OI Coverage</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">{sourceCoverage.liveOi}/{sourceCoverage.total}</div>
            <p className="mt-1 text-xs text-muted-foreground">Markets using protocol position counters instead of pool/depth inference. {sourceCoverage.dustOi} dust / {sourceCoverage.missingOi} missing.</p>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-primary/20 tech-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Live Funding Coverage</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">{sourceCoverage.liveFunding}/{sourceCoverage.total}</div>
            <p className="mt-1 text-xs text-muted-foreground">Markets backed by protocol funding state instead of runtime benchmark fallback.</p>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-card/50 border-primary/20 tech-border">
        <CardHeader>
          <CardTitle className="text-primary">Directional OI</CardTitle>
          <CardDescription>Separate long and short exposure across monitored markets, plus current net skew.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded border border-border bg-background/40 p-3">
            <div className="text-xs text-muted-foreground">Long OI</div>
            <div className="mt-2 text-2xl font-bold text-primary">${Intl.NumberFormat("en-US").format(snapshot.markets.reduce((sum, market) => sum + market.longOpenInterestUsd, 0))}</div>
            <div className="mt-1 text-xs text-muted-foreground">Protocol long exposure used in the current snapshot.</div>
          </div>
          <div className="rounded border border-border bg-background/40 p-3">
            <div className="text-xs text-muted-foreground">Short OI</div>
            <div className="mt-2 text-2xl font-bold text-primary">${Intl.NumberFormat("en-US").format(snapshot.markets.reduce((sum, market) => sum + market.shortOpenInterestUsd, 0))}</div>
            <div className="mt-1 text-xs text-muted-foreground">Protocol short exposure used in the current snapshot.</div>
          </div>
          <div className="rounded border border-border bg-background/40 p-3">
            <div className="text-xs text-muted-foreground">Net OI Delta</div>
            <div className={`mt-2 text-2xl font-bold ${snapshot.markets.reduce((sum, market) => sum + market.longOpenInterestUsd - market.shortOpenInterestUsd, 0) >= 0 ? "text-primary" : "text-destructive"}`}>${Intl.NumberFormat("en-US").format(Math.abs(snapshot.markets.reduce((sum, market) => sum + market.longOpenInterestUsd - market.shortOpenInterestUsd, 0)))}</div>
            <div className="mt-1 text-xs text-muted-foreground">{snapshot.markets.reduce((sum, market) => sum + market.longOpenInterestUsd - market.shortOpenInterestUsd, 0) >= 0 ? "Net long" : "Net short"} imbalance across monitored markets.</div>
          </div>
          <div className="rounded border border-border bg-background/40 p-3">
            <div className="text-xs text-muted-foreground">Directional Mix</div>
            <div className="mt-2 text-2xl font-bold text-primary">
              {snapshot.dashboard.stats.find((stat) => stat.label === "Total Open Interest")?.value === "$0" || snapshot.markets.reduce((sum, market) => sum + market.openInterestUsd, 0) === 0
                ? "0 / 0"
                : `${((snapshot.markets.reduce((sum, market) => sum + market.longOpenInterestUsd, 0) / snapshot.markets.reduce((sum, market) => sum + market.openInterestUsd, 0)) * 100).toFixed(1)}% / ${((snapshot.markets.reduce((sum, market) => sum + market.shortOpenInterestUsd, 0) / snapshot.markets.reduce((sum, market) => sum + market.openInterestUsd, 0)) * 100).toFixed(1)}%`}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">Long share / short share of total open interest.</div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-card/50 border-primary/20 tech-border">
        <CardHeader>
          <CardTitle className="text-primary">Market Breakdown</CardTitle>
          <CardDescription>Per-market summary cards. Dashboard stays aggregated above; use these cards to compare ETH, BTC, and future markets side by side.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {marketBreakdown.map((market) => (
            <div key={`${market.symbol}-breakdown`} className="rounded border border-border bg-background/40 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-lg font-semibold text-foreground">{market.displayName}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{market.watchStatus}</div>
                </div>
                <Badge variant="outline" className={confidenceBadge(marketAlertTone(market.alertLevel))}>
                  {market.alertLevel.toUpperCase()}
                </Badge>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div className="rounded border border-border p-3">
                  <div className="text-xs text-muted-foreground">OI</div>
                  <div className="mt-1 font-semibold text-foreground">${Intl.NumberFormat("en-US").format(Math.round(market.openInterestUsd))}</div>
                </div>
                <div className="rounded border border-border p-3">
                  <div className="text-xs text-muted-foreground">Position Collateral</div>
                  <div className="mt-1 font-semibold text-foreground">${Intl.NumberFormat("en-US").format(Math.round(market.positionCollateralUsd))}</div>
                </div>
                <div className="rounded border border-border p-3">
                  <div className="text-xs text-muted-foreground">Long / Short Split</div>
                  <div className="mt-1 font-semibold text-foreground">{market.longSharePct.toFixed(1)}% / {market.shortSharePct.toFixed(1)}%</div>
                </div>
                <div className="rounded border border-border p-3">
                  <div className="text-xs text-muted-foreground">Avg Leverage</div>
                  <div className="mt-1 font-semibold text-foreground">{(market.positionCollateralUsd > 0 ? market.openInterestUsd / market.positionCollateralUsd : 0).toFixed(2)}x</div>
                </div>
                <div className="rounded border border-border p-3">
                  <div className="text-xs text-muted-foreground">Skew</div>
                  <div className={`mt-1 font-semibold ${metricTone(market.skewPct).replace("warning", "text-yellow-500").replace("critical", "text-destructive").replace("good", "text-primary")}`}>{market.skewPct >= 0 ? "+" : ""}{market.skewPct.toFixed(2)}%</div>
                </div>
                <div className="rounded border border-border p-3">
                  <div className="text-xs text-muted-foreground">Oracle Gap</div>
                  <div className={`mt-1 font-semibold ${market.externalPriceDeviationPct >= 15 ? "text-yellow-500" : "text-primary"}`}>{market.externalPriceDeviationPct.toFixed(2)}%</div>
                </div>
                <div className="rounded border border-border p-3">
                  <div className="text-xs text-muted-foreground">Long Funding</div>
                  <div className={`mt-1 font-semibold ${market.longFundingAprPct >= 0 ? "text-yellow-500" : "text-primary"}`}>{market.longFundingAprPct.toFixed(2)}%</div>
                </div>
                <div className="rounded border border-border p-3">
                  <div className="text-xs text-muted-foreground">Short Funding</div>
                  <div className={`mt-1 font-semibold ${market.shortFundingAprPct >= 0 ? "text-yellow-500" : "text-primary"}`}>{market.shortFundingAprPct.toFixed(2)}%</div>
                </div>
                <div className="rounded border border-border p-3">
                  <div className="text-xs text-muted-foreground">Reserve Factor</div>
                  <div className="mt-1 font-semibold text-foreground">L {market.reserveFactorLongPct.toFixed(1)}% · S {market.reserveFactorShortPct.toFixed(1)}%</div>
                </div>
                <div className="rounded border border-border p-3">
                  <div className="text-xs text-muted-foreground">LP Cap Usage</div>
                  <div className="mt-1 font-semibold text-foreground">L {((market.reserveFactorLongPct > 0 && market.poolCollateralAmount > 0) ? (market.longOpenInterestUsd / (market.poolCollateralAmount * (market.reserveFactorLongPct / 100))) * 100 : 0).toFixed(1)}% · S {((market.reserveFactorShortPct > 0 && market.poolCollateralAmount > 0) ? (market.shortOpenInterestUsd / (market.poolCollateralAmount * (market.reserveFactorShortPct / 100))) * 100 : 0).toFixed(1)}%</div>
                </div>
              </div>
              <div className="mt-3 text-xs text-muted-foreground">
                Risk score {market.riskScore.toFixed(2)} · Long ${Intl.NumberFormat("en-US").format(Math.round(market.longOpenInterestUsd))} · Short ${Intl.NumberFormat("en-US").format(Math.round(market.shortOpenInterestUsd))} · Collateral ${Intl.NumberFormat("en-US").format(Math.round(market.positionCollateralUsd))}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-4">
        {snapshot.markets.map((market) => (
          <Card key={`${market.symbol}-external-price`} className="bg-card/50 border-primary/20 tech-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-primary">{market.symbol} External Reference</CardTitle>
              <CardDescription>{market.externalVenueName} · {market.externalPriceSource}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-xs text-muted-foreground">
              <div className="grid grid-cols-2 gap-2">
                <div>Aggregate</div>
                <div className="text-right text-foreground">${market.externalPriceUsd.toLocaleString()}</div>
                <div>Index</div>
                <div className="text-right text-foreground">{market.externalIndexPriceUsd ? `$${market.externalIndexPriceUsd.toLocaleString()}` : "n/a"}</div>
                <div>Spot</div>
                <div className="text-right text-foreground">{market.externalSpotPriceUsd ? `$${market.externalSpotPriceUsd.toLocaleString()}` : "n/a"}</div>
                <div>Mark</div>
                <div className="text-right text-foreground">{market.externalMarkPriceUsd ? `$${market.externalMarkPriceUsd.toLocaleString()}` : "n/a"}</div>
                <div>Oracle Gap</div>
                <div className="text-right text-foreground">{market.externalPriceDeviationPct.toFixed(2)}%</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="bg-card/50 border-primary/20 tech-border">
        <CardHeader>
          <CardTitle className="text-primary">Alert Category Summary</CardTitle>
          <CardDescription>Current incident mix across the live alert stream.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          {alertCategorySummary.map((item) => (
            <div key={item.category} className="rounded border border-border bg-background/40 p-3">
              <div className="text-xs text-muted-foreground">{item.category}</div>
              <div className="mt-2 text-2xl font-bold text-primary">{item.count}</div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="bg-card/50 border-primary/20 tech-border">
        <CardHeader>
          <CardTitle className="text-primary">Environment Diagnostics</CardTitle>
          <CardDescription>Current fork-level issues and monitor data limits summarized for operators.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {environmentDiagnostics.map((item) => (
            <div key={item.title} className="rounded border border-border bg-background/40 p-3">
              <div className="mb-2 flex items-center gap-2">
                <Badge variant="outline" className={confidenceBadge(item.tone)}>{item.title}</Badge>
              </div>
              <p className="text-sm text-muted-foreground">{item.detail}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="bg-card/50 border-primary/20 tech-border">
        <CardHeader>
          <CardTitle className="text-primary">Data Confidence Matrix</CardTitle>
          <CardDescription>Per-market source quality for risk, OI, funding, oracle divergence, and external venue reference.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {confidenceMatrix.map((row) => (
            <div key={`${row.symbol}-confidence`} className="rounded border border-border bg-background/40 p-3">
              <div className="mb-3 font-semibold text-primary">{row.symbol}</div>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-5">
                {row.cells.map((cell) => (
                  <div key={`${row.symbol}-${cell.label}`} className="rounded border border-border bg-card/40 p-3">
                    <div className="text-xs text-muted-foreground">{cell.label}</div>
                    <div className="mt-2">
                      <Badge variant="outline" className={confidenceBadge(cell.tone)}>{cell.value}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2 bg-card/50 border-primary/20 tech-border">
          <CardHeader>
            <CardTitle className="text-primary flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Aggregate Exposure
            </CardTitle>
            <CardDescription>Total monitored open interest across high-priority markets.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[320px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={snapshot.dashboard.exposureSeries}>
                  <defs>
                    <linearGradient id="exposure-gradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="var(--primary)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.3} />
                  <XAxis dataKey="time" stroke="var(--muted-foreground)" tickLine={false} axisLine={false} />
                  <YAxis stroke="var(--muted-foreground)" tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "var(--card)", borderColor: "var(--border)" }}
                    formatter={(value: number) => [`$${Intl.NumberFormat("en-US").format(value)}`, "Open Interest"]}
                  />
                  <Area type="monotone" dataKey="value" stroke="var(--primary)" fill="url(#exposure-gradient)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/50 border-primary/20 tech-border">
          <CardHeader>
            <CardTitle className="text-primary flex items-center gap-2">
              <Siren className="h-5 w-5" />
              Priority Markets
            </CardTitle>
            <CardDescription>Sorted by current risk score and incident severity.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {priority.map((market) => (
              <div key={market.symbol} className="rounded border border-border bg-background/40 p-3">
                <div className="mb-2 flex items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold">{market.displayName}</div>
                    <div className="text-xs text-muted-foreground">
                      {market.tier} · funding long {market.longFundingAprPct.toFixed(1)}% / short {market.shortFundingAprPct.toFixed(1)}% vs {market.externalVenueName} {market.externalFundingAprPct.toFixed(1)}% · skew {market.skewPct.toFixed(1)}%
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <Badge className={alertBadge(market.alertLevel)}>{market.watchStatus}</Badge>
                    <Badge variant="outline" className={analyticsBadge(market.analyticsSource)}>{market.analyticsSource === "runtime-derived" ? "runtime risk" : "fallback risk"}</Badge>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                  <div>Risk Score</div>
                  <div className="text-right text-foreground">{market.riskScore.toFixed(2)}</div>
                  <div>OI</div>
                  <div className="text-right text-foreground">${Intl.NumberFormat("en-US").format(market.openInterestUsd)}</div>
                  <div>1h Vol / Limit</div>
                  <div className="text-right text-foreground">{market.realizedVol1hPct.toFixed(2)}% / {market.volLimitPct.toFixed(2)}%</div>
                  <div>Venue Price Gap</div>
                  <div className="text-right text-foreground">{market.externalPriceDeviationPct.toFixed(2)}%</div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {snapshot.dashboard.notes.map((note) => (
          <Card key={note.title} className="bg-card/50 border-primary/20 tech-border">
            <CardHeader>
              <CardTitle className={`text-base ${toneClass(note.tone)}`}>
                {note.tone === "critical" ? <AlertTriangle className="mr-2 inline h-4 w-4" /> : <ShieldCheck className="mr-2 inline h-4 w-4" />}
                {note.title}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{note.body}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
