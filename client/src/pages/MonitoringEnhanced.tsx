import { useMemo, useState } from "react";
import { Link } from "wouter";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Activity, Pin, RefreshCw, Search } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useMonitoring } from "@/contexts/MonitoringContext";

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

function diagnosticsBadge(tone: "good" | "warning" | "critical" | "neutral") {
  if (tone === "good") return "bg-primary/20 text-primary border-primary/30";
  if (tone === "warning") return "bg-yellow-500/20 text-yellow-500 border-yellow-500/30";
  if (tone === "critical") return "bg-destructive/20 text-destructive border-destructive/40";
  return "bg-muted/20 text-muted-foreground border-border";
}

function explainSource(label: string, detail?: string) {
  const map: Record<string, string> = {
    "live-position-counters": "Protocol OPEN_INTEREST_IN_TOKENS counters are populated and used directly.",
    "pool-depth-inferred": "Direct OI counters were not sufficient for this snapshot, so OI is inferred from pool/depth state.",
    "reader-next-funding": "Funding values come directly from Reader nextFunding long/short factors.",
    "runtime-benchmark": "Funding comparison value is derived from live runtime conditions rather than a direct venue funding feed.",
    "live-aggregate": "External reference price uses an aggregate of available live venue signals.",
    "live-index": "External reference price comes from a live venue index price.",
    "live-spot": "External reference price comes from a live venue spot market read.",
    "live-mark": "External reference price comes from a live venue perp mark price.",
    "config-reference": "External reference fell back to the configured environment reference price.",
    "runtime-derived": "Risk metrics are computed from live protocol/runtime state.",
    "seeded-fallback": "Risk metrics are using seeded fallback values because live state is incomplete.",
  };
  return map[label] ?? detail ?? "No additional explanation available.";
}

function buildDiagnostics(selected: {
  analyticsSource: string;
  var99_9Pct: number;
  riskScore: number;
  oiSource: string;
  oiCounterStatus: string;
  oiCounterReason: string;
  fundingSignalSource: string;
  fundingUpdatedAgoMinutes?: number;
  externalPriceDeviationPct: number;
  oraclePrice: number;
  externalVenueName: string;
  externalPriceUsd: number;
  externalPriceSource: string;
  externalFundingAprPct: number;
}) {
  const oracleTone = selected.externalPriceDeviationPct >= 50 ? "critical" : selected.externalPriceDeviationPct >= 5 ? "warning" : "good";
  const fundingAge = selected.fundingUpdatedAgoMinutes ?? 0;
  const fundingTone = selected.fundingSignalSource === "reader-next-funding"
    ? (fundingAge >= 720 ? "critical" : fundingAge >= 120 ? "warning" : "good")
    : "warning";
  const oiTone = selected.oiSource === "live-position-counters"
    ? "good"
    : selected.oiCounterStatus === "dust"
      ? "warning"
      : "critical";

  return [
    {
      label: "Risk",
      value: selected.analyticsSource === "runtime-derived" ? "runtime-derived" : "seeded fallback",
      tone: selected.analyticsSource === "runtime-derived" ? "good" : "warning",
      detail: "VaR 99.9 " + selected.var99_9Pct.toFixed(2) + "% · score " + selected.riskScore.toFixed(2),
    },
    {
      label: "OI",
      value: selected.oiSource === "live-position-counters" ? "live counters" : selected.oiCounterStatus + " / inferred",
      tone: oiTone,
      detail: selected.oiCounterReason,
    },
    {
      label: "Funding",
      value: selected.fundingSignalSource === "reader-next-funding" ? "reader direct" : "runtime benchmark",
      tone: fundingTone,
      detail: selected.fundingUpdatedAgoMinutes !== undefined
        ? "updated " + selected.fundingUpdatedAgoMinutes.toFixed(1) + " min ago"
        : "funding freshness unavailable",
    },
    {
      label: "Oracle",
      value: selected.externalPriceDeviationPct.toFixed(2) + "% gap",
      tone: oracleTone,
      detail: "protocol " + selected.oraclePrice.toLocaleString() + " vs " + selected.externalVenueName + " " + selected.externalPriceUsd.toLocaleString(),
    },
    {
      label: "Venue",
      value: selected.externalPriceSource,
      tone: selected.externalPriceSource === "live-aggregate" ? "good" : selected.externalPriceSource.startsWith("live-") ? "warning" : "critical",
      detail: selected.externalVenueName + " funding " + selected.externalFundingAprPct.toFixed(2) + "%",
    },
  ] as const;
}

function num(value: number | undefined | null) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export default function MonitoringEnhanced() {
  const { snapshot, loading, error, refresh } = useMonitoring();
  const [activeTab, setActiveTab] = useState("overview");
  const [searchQuery, setSearchQuery] = useState("");
  const [tierFilter, setTierFilter] = useState("All");
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const [pins, setPins] = useState<string[]>([]);

  const markets = snapshot?.markets ?? [];
  const selected = useMemo(() => {
    const fallback = markets[0]?.symbol ?? null;
    const symbol = selectedSymbol ?? fallback;
    return markets.find((market) => market.symbol === symbol) ?? null;
  }, [markets, selectedSymbol]);

  const selectedSeries = useMemo(
    () => snapshot?.marketSeries.find((series) => series.symbol === selected?.symbol) ?? null,
    [snapshot, selected],
  );

  const filteredMarkets = useMemo(() => {
    return [...markets]
      .filter((market) => {
        const matchesSearch = market.displayName.toLowerCase().includes(searchQuery.toLowerCase()) || market.symbol.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesTier = tierFilter === "All" || market.tier === tierFilter;
        return matchesSearch && matchesTier;
      })
      .sort((left, right) => {
        const leftPinned = pins.includes(left.symbol) || left.pinned;
        const rightPinned = pins.includes(right.symbol) || right.pinned;
        if (leftPinned !== rightPinned) return leftPinned ? -1 : 1;
        return right.riskScore - left.riskScore;
      });
  }, [markets, pins, searchQuery, tierFilter]);

  const sourceSummary = useMemo(() => ({
    runtimeRisk: markets.filter((market) => market.analyticsSource === "runtime-derived").length,
    liveOi: markets.filter((market) => market.oiSource === "live-position-counters").length,
    liveFunding: markets.filter((market) => market.fundingSignalSource === "reader-next-funding").length,
  }), [markets]);

  const togglePin = (symbol: string) => {
    setPins((current) => (current.includes(symbol) ? current.filter((value) => value !== symbol) : [...current, symbol]));
  };

  if (loading && !snapshot) {
    return <div className="text-sm text-muted-foreground">Loading market monitors...</div>;
  }

  if (error || !snapshot) {
    return (
      <Card className="bg-card/50 border-destructive/30 tech-border">
        <CardHeader>
          <CardTitle className="text-destructive">Market snapshot unavailable</CardTitle>
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
          <h2 className="text-3xl font-bold tracking-tight text-primary uppercase">Market Monitoring</h2>
          <p className="text-muted-foreground">Search, pin, and inspect risk posture per market from the shared monitoring snapshot.</p>
        </div>
        <Button variant="outline" className="border-primary/40 text-primary hover:bg-primary/10" onClick={() => void refresh()}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      </div>

      <Card className="bg-card/50 border-primary/20 tech-border">
        <CardContent className="p-4">
          <div className="flex flex-col gap-4 md:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-10 bg-background/50 border-primary/20" placeholder="Search symbol or market" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} />
            </div>
            <div className="flex gap-2">
              {["All", "Tier 1", "Tier 2", "Tier 3"].map((tier) => (
                <button
                  key={tier}
                  type="button"
                  onClick={() => setTierFilter(tier)}
                  className={`rounded border px-4 py-2 text-sm transition-all ${
                    tierFilter === tier ? "border-primary/50 bg-primary/20 text-primary" : "border-primary/20 bg-background/50 text-muted-foreground hover:border-primary/30"
                  }`}
                >
                  {tier}
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card className="bg-card/50 border-primary/20 tech-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Runtime Risk Coverage</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">{sourceSummary.runtimeRisk}/{markets.length}</div>
            <p className="mt-1 text-xs text-muted-foreground">Markets currently driven by runtime-derived risk instead of seeded fallback.</p>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-primary/20 tech-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Live OI Coverage</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">{sourceSummary.liveOi}/{markets.length}</div>
            <p className="mt-1 text-xs text-muted-foreground">Markets using protocol position counters instead of pool/depth inference.</p>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-primary/20 tech-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Live Funding Coverage</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">{sourceSummary.liveFunding}/{markets.length}</div>
            <p className="mt-1 text-xs text-muted-foreground">Markets backed by protocol funding state instead of the runtime benchmark path.</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <Card className="bg-card/50 border-primary/20 tech-border">
          <CardHeader>
            <CardTitle className="text-primary flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Market Grid
            </CardTitle>
            <CardDescription>Pinned markets stay on top. High risk markets remain visible without changing the page structure.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {filteredMarkets.map((market) => {
              const isPinned = pins.includes(market.symbol) || market.pinned;
              return (
                <button
                  key={market.symbol}
                  type="button"
                  onClick={() => setSelectedSymbol(market.symbol)}
                  className={`w-full rounded border p-4 text-left transition-colors ${selected?.symbol === market.symbol ? "border-primary/50 bg-primary/10" : "border-border bg-background/40 hover:border-primary/25"}`}
                >
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{market.displayName}</span>
                        <Badge variant="outline" className="border-primary/30 text-primary">{market.tier}</Badge>
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        OI {Intl.NumberFormat("en-US").format(market.openInterestUsd)} ({market.oiSource === "live-position-counters" ? "live counters" : market.oiCounterStatus}) · funding {market.fundingAprPct.toFixed(1)}% vs {market.externalVenueName} {market.externalFundingAprPct.toFixed(1)}% · var99.9 {market.var99_9Pct.toFixed(2)}% ({market.analyticsSource === "runtime-derived" ? "runtime" : "fallback"})
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex flex-col items-end gap-2">
                        <Badge className={alertBadge(market.alertLevel)}>{market.watchStatus}</Badge>
                        <Badge variant="outline" className={analyticsBadge(market.analyticsSource)}>{market.analyticsSource === "runtime-derived" ? "runtime risk" : "fallback risk"}</Badge>
                      </div>
                      <span
                        className={`rounded border p-1 ${isPinned ? "border-primary/40 text-primary" : "border-border text-muted-foreground"}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          togglePin(market.symbol);
                        }}
                      >
                        <Pin className="h-4 w-4" />
                      </span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground md:grid-cols-4">
                    <div>Mark / Oracle</div>
                    <div className="text-right text-foreground">${market.markPrice.toLocaleString()} / ${market.oraclePrice.toLocaleString()}</div>
                    <div>Protocol Deviation</div>
                    <div className="text-right text-foreground">{market.priceDeviationPct.toFixed(2)}%</div>
                    <div>Venue / Source</div>
                    <div className="text-right text-foreground">${market.externalPriceUsd.toLocaleString()} / {market.externalPriceSource}</div>
                    <div>Venue Gap</div>
                    <div className="text-right text-foreground">{market.externalPriceDeviationPct.toFixed(2)}%</div>
                    <div>Skew</div>
                    <div className="text-right text-foreground">{market.skewPct.toFixed(1)}%</div>
                    <div>Risk Score</div>
                    <div className="text-right text-foreground">{market.riskScore.toFixed(2)}</div>
                  </div>
                </button>
              );
            })}
          </CardContent>
        </Card>

        <Card className="bg-card/50 border-primary/20 tech-border">
          <CardHeader>
            <CardTitle className="text-primary">Selected Market</CardTitle>
            <CardDescription>{selected ? `${selected.displayName} control panel` : "Choose a market"}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {selected ? (
              <>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3">
                  {buildDiagnostics(selected).map((item) => (
                    <div key={item.label} className="rounded border border-border bg-background/40 p-3 min-h-[132px]">
                      <div className="flex flex-col gap-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground/80">{item.label}</div>
                          <Badge variant="outline" className={`shrink-0 whitespace-nowrap ${diagnosticsBadge(item.tone)}`}>
                            {item.tone === "good" ? "live" : item.tone === "warning" ? "watch" : "stress"}
                          </Badge>
                        </div>
                        <div className="space-y-2">
                          <div className="text-sm font-semibold leading-snug break-words text-foreground/95">{item.value}</div>
                          <div className="text-xs leading-6 break-words text-muted-foreground">{item.detail}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                  <div className="rounded border border-border bg-background/40 p-3">
                    <div className="text-xs text-muted-foreground">Long OI</div>
                    <div className="mt-1 text-lg font-semibold">${Intl.NumberFormat("en-US").format(selected.longOpenInterestUsd)}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{selected.longOpenInterestTokens.toFixed(6)} tokens</div>
                  </div>
                  <div className="rounded border border-border bg-background/40 p-3">
                    <div className="text-xs text-muted-foreground">Short OI</div>
                    <div className="mt-1 text-lg font-semibold">${Intl.NumberFormat("en-US").format(selected.shortOpenInterestUsd)}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{selected.shortOpenInterestTokens.toFixed(6)} tokens</div>
                  </div>
                  <div className="rounded border border-border bg-background/40 p-3">
                    <div className="text-xs text-muted-foreground">Net OI Delta</div>
                    <div className={`mt-1 text-lg font-semibold ${selected.longOpenInterestUsd - selected.shortOpenInterestUsd >= 0 ? "text-primary" : "text-destructive"}`}>${Intl.NumberFormat("en-US").format(Math.abs(selected.longOpenInterestUsd - selected.shortOpenInterestUsd))}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{selected.longOpenInterestUsd - selected.shortOpenInterestUsd >= 0 ? "Net long" : "Net short"}</div>
                  </div>
                  <div className="rounded border border-border bg-background/40 p-3">
                    <div className="text-xs text-muted-foreground">Long / Short Split</div>
                    <div className="mt-1 text-lg font-semibold">{selected.longSharePct.toFixed(1)}% / {selected.shortSharePct.toFixed(1)}%</div>
                  </div>
                  <div className="rounded border border-border bg-background/40 p-3">
                    <div className="text-xs text-muted-foreground">Skew</div>
                    <div className="mt-1 text-lg font-semibold">{selected.skewPct.toFixed(2)}%</div>
                    <div className="mt-1 text-xs text-muted-foreground">Directional imbalance derived from current long/short exposure.</div>
                  </div>
                  <div className="rounded border border-border bg-background/40 p-3">
                    <div className="text-xs text-muted-foreground">Tail Ratio</div>
                    <div className="mt-1 text-lg font-semibold">{selected.tailRatio.toFixed(3)}</div>
                  </div>
                  <div className="rounded border border-border bg-background/40 p-3">
                    <div className="text-xs text-muted-foreground">Long PnL / Pool</div>
                    <div className={`mt-1 text-lg font-semibold ${selected.longPnlToPoolFactor >= 0 ? "text-yellow-500" : "text-primary"}`}>{selected.longPnlToPoolFactor.toFixed(2)}%</div>
                    <div className="mt-1 text-xs text-muted-foreground">Direct protocol pnl-to-pool factor for the long side.</div>
                  </div>
                  <div className="rounded border border-border bg-background/40 p-3">
                    <div className="text-xs text-muted-foreground">Short PnL / Pool</div>
                    <div className={`mt-1 text-lg font-semibold ${selected.shortPnlToPoolFactor >= 0 ? "text-yellow-500" : "text-primary"}`}>{selected.shortPnlToPoolFactor.toFixed(2)}%</div>
                    <div className="mt-1 text-xs text-muted-foreground">Direct protocol pnl-to-pool factor for the short side.</div>
                  </div>
                  <div className="rounded border border-border bg-background/40 p-3">
                    <div className="text-xs text-muted-foreground">Available Liquidity</div>
                    <div className="mt-1 text-lg font-semibold">L ${Intl.NumberFormat("en-US").format(Math.round(selected.availableLongUsd))} · S ${Intl.NumberFormat("en-US").format(Math.round(selected.availableShortUsd))}</div>
                    <div className="mt-1 text-xs text-muted-foreground">Direct Reader headroom after OI, reserve, and OI-reserve caps.</div>
                  </div>
                  <div className="rounded border border-border bg-background/40 p-3">
                    <div className="text-xs text-muted-foreground">Max OI Cap</div>
                    <div className="mt-1 text-lg font-semibold">L ${Intl.NumberFormat("en-US").format(Math.round(num(selected.maxOpenInterestLongUsd)))} · S ${Intl.NumberFormat("en-US").format(Math.round(num(selected.maxOpenInterestShortUsd)))}</div>
                    <div className="mt-1 text-xs text-muted-foreground">Hard per-side open interest caps from protocol config.</div>
                  </div>
                  <div className="rounded border border-border bg-background/40 p-3">
                    <div className="text-xs text-muted-foreground">Max OI Usage</div>
                    <div className="mt-1 text-lg font-semibold">
                      L {((num(selected.maxOpenInterestLongUsd) > 0) ? (num(selected.longOpenInterestUsd) / num(selected.maxOpenInterestLongUsd)) * 100 : 0).toFixed(1)}%
                      {" · "}
                      S {((num(selected.maxOpenInterestShortUsd) > 0) ? (num(selected.shortOpenInterestUsd) / num(selected.maxOpenInterestShortUsd)) * 100 : 0).toFixed(1)}%
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">Current side OI divided by the hard max open interest cap.</div>
                  </div>
                  <div className="rounded border border-border bg-background/40 p-3">
                    <div className="text-xs text-muted-foreground">Max OI Remaining</div>
                    <div className="mt-1 text-lg font-semibold">
                      L ${Intl.NumberFormat("en-US").format(Math.round(Math.max(0, num(selected.maxOpenInterestLongUsd) - num(selected.longOpenInterestUsd))))}
                      {" · "}
                      S ${Intl.NumberFormat("en-US").format(Math.round(Math.max(0, num(selected.maxOpenInterestShortUsd) - num(selected.shortOpenInterestUsd))))}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">Remaining headroom implied only by hard max open interest caps.</div>
                  </div>
                  <div className="rounded border border-border bg-background/40 p-3">
                    <div className="text-xs text-muted-foreground">Soft OI Factor</div>
                    <div className="mt-1 text-lg font-semibold">L {num(selected.maxOpenInterestFactorLongPct).toFixed(1)}% · S {num(selected.maxOpenInterestFactorShortPct).toFixed(1)}%</div>
                    <div className="mt-1 text-xs text-muted-foreground">Directional soft OI caps derived from pool collateral.</div>
                  </div>
                  <div className="rounded border border-border bg-background/40 p-3">
                    <div className="text-xs text-muted-foreground">Soft OI Usage</div>
                    <div className="mt-1 text-lg font-semibold">
                      L {((num(selected.maxOpenInterestFactorLongPct) > 0 && num(selected.poolUsdWithoutPnl) > 0) ? (num(selected.longOpenInterestUsd) / (num(selected.poolUsdWithoutPnl) * (num(selected.maxOpenInterestFactorLongPct) / 100))) * 100 : 0).toFixed(1)}%
                      {" · "}
                      S {((num(selected.maxOpenInterestFactorShortPct) > 0 && num(selected.poolUsdWithoutPnl) > 0) ? (num(selected.shortOpenInterestUsd) / (num(selected.poolUsdWithoutPnl) * (num(selected.maxOpenInterestFactorShortPct) / 100))) * 100 : 0).toFixed(1)}%
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">Current side OI divided by pool-based soft OI cap.</div>
                  </div>
                  <div className="rounded border border-border bg-background/40 p-3">
                    <div className="text-xs text-muted-foreground">Soft OI Remaining</div>
                    <div className="mt-1 text-lg font-semibold">
                      L ${Intl.NumberFormat("en-US").format(Math.round(Math.max(0, num(selected.poolUsdWithoutPnl) * (num(selected.maxOpenInterestFactorLongPct) / 100) - num(selected.longOpenInterestUsd))))}
                      {" · "}
                      S ${Intl.NumberFormat("en-US").format(Math.round(Math.max(0, num(selected.poolUsdWithoutPnl) * (num(selected.maxOpenInterestFactorShortPct) / 100) - num(selected.shortOpenInterestUsd))))}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">Remaining headroom implied only by soft max OI factors.</div>
                  </div>
                  <div className="rounded border border-border bg-background/40 p-3">
                    <div className="text-xs text-muted-foreground">OI Reserve Factor</div>
                    <div className="mt-1 text-lg font-semibold">L {num(selected.openInterestReserveFactorLongPct).toFixed(1)}% · S {num(selected.openInterestReserveFactorShortPct).toFixed(1)}%</div>
                    <div className="mt-1 text-xs text-muted-foreground">Directional OI-reserve cap factors from protocol config.</div>
                  </div>
                  <div className="rounded border border-border bg-background/40 p-3">
                    <div className="text-xs text-muted-foreground">OI Reserve Usage</div>
                    <div className="mt-1 text-lg font-semibold">
                      L {((num(selected.openInterestReserveFactorLongPct) > 0 && num(selected.poolUsdWithoutPnl) > 0) ? (num(selected.longReservedUsd) / (num(selected.poolUsdWithoutPnl) * (num(selected.openInterestReserveFactorLongPct) / 100))) * 100 : 0).toFixed(1)}%
                      {" · "}
                      S {((num(selected.openInterestReserveFactorShortPct) > 0 && num(selected.poolUsdWithoutPnl) > 0) ? (num(selected.shortReservedUsd) / (num(selected.poolUsdWithoutPnl) * (num(selected.openInterestReserveFactorShortPct) / 100))) * 100 : 0).toFixed(1)}%
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">Reserved USD divided by the OI reserve cap for each side.</div>
                  </div>
                  <div className="rounded border border-border bg-background/40 p-3">
                    <div className="text-xs text-muted-foreground">OI Reserve Remaining</div>
                    <div className="mt-1 text-lg font-semibold">
                      L ${Intl.NumberFormat("en-US").format(Math.round(Math.max(0, num(selected.poolUsdWithoutPnl) * (num(selected.openInterestReserveFactorLongPct) / 100) - num(selected.longReservedUsd))))}
                      {" · "}
                      S ${Intl.NumberFormat("en-US").format(Math.round(Math.max(0, num(selected.poolUsdWithoutPnl) * (num(selected.openInterestReserveFactorShortPct) / 100) - num(selected.shortReservedUsd))))}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">Remaining headroom implied only by OI reserve factor, before other caps are considered.</div>
                  </div>
                  <div className="rounded border border-border bg-background/40 p-3">
                    <div className="text-xs text-muted-foreground">Pool USD Without PnL</div>
                    <div className="mt-1 text-lg font-semibold">${Intl.NumberFormat("en-US").format(Math.round(selected.poolUsdWithoutPnl))}</div>
                  </div>
                  <div className="rounded border border-border bg-background/40 p-3">
                    <div className="text-xs text-muted-foreground">Vault USDC Balance</div>
                    <div className="mt-1 text-lg font-semibold">{Intl.NumberFormat("en-US").format(selected.collateralVaultBalance)}</div>
                  </div>
                  <div className="rounded border border-border bg-background/40 p-3">
                    <div className="text-xs text-muted-foreground">Vault Index Balance</div>
                    <div className="mt-1 text-lg font-semibold">{Intl.NumberFormat("en-US", { maximumFractionDigits: 4 }).format(selected.indexVaultBalance)}</div>
                  </div>
                  <div className="rounded border border-border bg-background/40 p-3">
                    <div className="text-xs text-muted-foreground">OI Change 24h</div>
                    <div className="mt-1 text-lg font-semibold">{selected.oiChange24hPct.toFixed(1)}%</div>
                  </div>
                  <div className="rounded border border-border bg-background/40 p-3">
                    <div className="text-xs text-muted-foreground">Long Funding APR</div>
                    <div className="mt-1 text-lg font-semibold">{selected.longFundingAprPct.toFixed(2)}%</div>
                    <div className="mt-1 text-xs text-muted-foreground">Direct Reader next funding for the long side.</div>
                  </div>
                  <div className="rounded border border-border bg-background/40 p-3">
                    <div className="text-xs text-muted-foreground">Short Funding APR</div>
                    <div className="mt-1 text-lg font-semibold">{selected.shortFundingAprPct.toFixed(2)}%</div>
                    <div className="mt-1 text-xs text-muted-foreground">Direct Reader next funding for the short side.</div>
                  </div>
                  <div className="rounded border border-border bg-background/40 p-3">
                    <div className="text-xs text-muted-foreground">Venue Price Gap</div>
                    <div className="mt-1 text-lg font-semibold">{selected.externalPriceDeviationPct.toFixed(2)}%</div>
                  </div>
                  <div className="rounded border border-border bg-background/40 p-3">
                    <div className="text-xs text-muted-foreground">Funding Source</div>
                    <div className="mt-1 text-lg font-semibold">protocol Reader nextFunding</div>
                  </div>
                  <div className="rounded border border-border bg-background/40 p-3">
                    <div className="text-xs text-muted-foreground">OI Source</div>
                    <div className="mt-1 text-lg font-semibold">{selected.oiSource === "live-position-counters" ? "live position counters" : `current snapshot inferred (${selected.oiCounterStatus})`}</div>
                  </div>
                  <div className="rounded border border-border bg-background/40 p-3 col-span-2">
                    <div className="text-xs text-muted-foreground">OI Counter Diagnosis</div>
                    <div className="mt-1 text-sm font-semibold">{selected.longOpenInterestTokens.toFixed(6)} long / {selected.shortOpenInterestTokens.toFixed(6)} short</div>
                    <div className="mt-1 text-xs text-muted-foreground">{selected.oiCounterReason}</div>
                  </div>
                  <div className="rounded border border-border bg-background/40 p-3">
                    <div className="text-xs text-muted-foreground">Funding Updated</div>
                    <div className="mt-1 text-lg font-semibold">{selected.fundingUpdatedAgoMinutes !== undefined ? `${selected.fundingUpdatedAgoMinutes.toFixed(1)} min ago` : "unavailable"}</div>
                  </div>
                  <div className="rounded border border-border bg-background/40 p-3">
                    <div className="text-xs text-muted-foreground">Funding Skew EMA</div>
                    <div className="mt-1 text-lg font-semibold">{selected.fundingSkewEmaPct.toFixed(2)}% / {selected.fundingSkewSampleIntervalMinutes.toFixed(0)} min</div>
                  </div>
                  <div className="rounded border border-border bg-background/40 p-3">
                    <div className="text-xs text-muted-foreground">Long Funding Snapshot Per Size</div>
                    <div className="mt-1 text-lg font-semibold">-{selected.longNegativeFundingFeePerSizePct.toFixed(4)}% / +{selected.longPositiveFundingFeePerSizePct.toFixed(4)}%</div>
                  </div>
                  <div className="rounded border border-border bg-background/40 p-3">
                    <div className="text-xs text-muted-foreground">Short Funding Snapshot Per Size</div>
                    <div className="mt-1 text-lg font-semibold">-{selected.shortNegativeFundingFeePerSizePct.toFixed(4)}% / +{selected.shortPositiveFundingFeePerSizePct.toFixed(4)}%</div>
                  </div>
                </div>

                <Tabs value={activeTab} onValueChange={setActiveTab}>
                  <TabsList className="grid w-full grid-cols-3 bg-card/60 border border-primary/20">
                    <TabsTrigger value="overview">Volatility</TabsTrigger>
                    <TabsTrigger value="funding">Funding</TabsTrigger>
                    <TabsTrigger value="oi">Open Interest</TabsTrigger>
                  </TabsList>
                  <TabsContent value="overview" className="pt-4">
                    <div className="h-[240px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={selectedSeries?.priceVolatility ?? []}>
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.3} />
                          <XAxis dataKey="time" stroke="var(--muted-foreground)" tickLine={false} axisLine={false} />
                          <YAxis stroke="var(--muted-foreground)" tickLine={false} axisLine={false} />
                          <Tooltip contentStyle={{ backgroundColor: "var(--card)", borderColor: "var(--border)" }} />
                          <Line type="monotone" dataKey="value" stroke="var(--chart-2)" strokeWidth={2} dot={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </TabsContent>
                  <TabsContent value="funding" className="pt-4">
                    <div className="h-[240px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={selectedSeries?.fundingApr ?? []}>
                          <defs>
                            <linearGradient id="funding-gradient" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.35} />
                              <stop offset="95%" stopColor="var(--primary)" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.3} />
                          <XAxis dataKey="time" stroke="var(--muted-foreground)" tickLine={false} axisLine={false} />
                          <YAxis stroke="var(--muted-foreground)" tickLine={false} axisLine={false} />
                          <Tooltip contentStyle={{ backgroundColor: "var(--card)", borderColor: "var(--border)" }} />
                          <Area type="monotone" dataKey="value" stroke="var(--primary)" fill="url(#funding-gradient)" strokeWidth={2} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </TabsContent>
                  <TabsContent value="oi" className="pt-4">
                    <div className="h-[240px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={selectedSeries?.openInterestUsd ?? []}>
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.3} />
                          <XAxis dataKey="time" stroke="var(--muted-foreground)" tickLine={false} axisLine={false} />
                          <YAxis stroke="var(--muted-foreground)" tickLine={false} axisLine={false} />
                          <Tooltip contentStyle={{ backgroundColor: "var(--card)", borderColor: "var(--border)" }} formatter={(value: number) => [`$${Intl.NumberFormat("en-US").format(value)}`, "OI"]} />
                          <Bar dataKey="value" fill="var(--chart-4)" radius={[0, 0, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </TabsContent>
                </Tabs>

                <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                  <Link href={`/alerts?asset=${selected.symbol}&category=group:oracle`}>
                    <Button variant="outline" className="w-full border-primary/30 text-primary hover:bg-primary/10">
                      View Oracle Alerts
                    </Button>
                  </Link>
                  <Link href={`/alerts?asset=${selected.symbol}&category=group:funding`}>
                    <Button variant="outline" className="w-full border-primary/30 text-primary hover:bg-primary/10">
                      View Funding Alerts
                    </Button>
                  </Link>
                  <Link href={`/alerts?asset=${selected.symbol}&category=group:oi`}>
                    <Button variant="outline" className="w-full border-primary/30 text-primary hover:bg-primary/10">
                      View OI Alerts
                    </Button>
                  </Link>
                </div>
              </>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
