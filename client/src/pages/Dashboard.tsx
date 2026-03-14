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

export default function Dashboard() {
  const { snapshot, loading, error, refresh } = useMonitoring();
  const priority = useMemo(() => snapshot?.dashboard.priorityMarkets ?? [], [snapshot]);
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

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {snapshot.dashboard.stats.map((stat) => (
          <Card key={stat.label} className="bg-card/50 border-primary/20 tech-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{stat.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${toneClass(stat.tone)}`}>{stat.value}</div>
              {stat.delta ? <p className="mt-1 text-xs text-muted-foreground">{stat.delta}</p> : null}
            </CardContent>
          </Card>
        ))}
      </div>

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
                      {market.tier} · funding {market.fundingAprPct.toFixed(1)}% APR vs {market.externalVenueName} {market.externalFundingAprPct.toFixed(1)}% · skew {market.skewPct.toFixed(1)}%
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
