import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Filter, RefreshCw, ShieldAlert } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMonitoring } from "@/contexts/MonitoringContext";

function levelBadge(level: string) {
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

function explainSignalSource(source: string) {
  const lower = source.toLowerCase();
  if (lower.includes("binance")) return "The alert uses a live Binance venue reference for comparison or divergence checks.";
  if (lower.includes("runtime benchmark")) return "The alert compares protocol state against a runtime-derived benchmark because no direct venue series was used for this signal.";
  if (lower.includes("protocol oi diagnostics")) return "The alert is driven by direct protocol diagnostics around OI counter availability and quality.";
  if (lower.includes("protocol funding state")) return "The alert is driven directly by protocol funding state and freshness data from DataStore.";
  return "This alert source comes from the current monitoring snapshot and should be read together with the source labels shown on dashboard and market views.";
}

function explainCategory(category: string) {
  const lower = category.toLowerCase();
  if (lower.includes("oracle")) return "Oracle divergence alerts flag gaps between protocol price and external venue reference price.";
  if (lower.includes("funding stale")) return "Funding stale alerts mean protocol funding state has not been refreshed recently enough for operators to trust it as current.";
  if (lower.includes("funding")) return "Funding divergence alerts compare protocol funding posture against a live or runtime-derived benchmark.";
  if (lower.includes("oi")) return "OI alerts explain whether direct protocol position counters are usable or whether the monitor had to infer OI.";
  return "This category is part of the shared monitoring incident model.";
}

export default function AlertsEnhanced() {
  const { snapshot, loading, error, refresh } = useMonitoring();
  const [tab, setTab] = useState("active");
  const [level, setLevel] = useState("all");
  const [asset, setAsset] = useState("all");
  const [category, setCategory] = useState("all");

  const alerts = snapshot?.alerts ?? [];
  const categoryQuickFilters = [
    { key: "all", label: "All", match: (_category: string) => true },
    { key: "oracle", label: "Oracle", match: (item: string) => item.toLowerCase().includes("oracle") },
    { key: "funding", label: "Funding", match: (item: string) => item.toLowerCase().includes("funding") },
    { key: "oi", label: "OI", match: (item: string) => item.toLowerCase().includes("oi") },
  ];
  const quickFilterCounts = useMemo(
    () => Object.fromEntries(categoryQuickFilters.map((filter) => [filter.key, alerts.filter((alert) => filter.match(alert.category)).length])),
    [alerts],
  );
  const levelSummary = useMemo(() => ({
    l3: alerts.filter((alert) => alert.level === "l3").length,
    l2: alerts.filter((alert) => alert.level === "l2").length,
    l1: alerts.filter((alert) => alert.level === "l1").length,
    active: alerts.filter((alert) => alert.status !== "resolved").length,
  }), [alerts]);
  const categorySummary = useMemo(() => {
    const counts = new Map<string, number>();
    for (const alert of alerts) counts.set(alert.category, (counts.get(alert.category) ?? 0) + 1);
    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((left, right) => right.count - left.count);
  }, [alerts]);
  const filteredAlerts = useMemo(
    () => alerts.filter((alert) =>
      (level === "all" || alert.level === level)
      && (asset === "all" || alert.assetSymbol === asset)
      && (
        category === "all"
        || category === alert.category
        || (category === "group:oracle" && alert.category.toLowerCase().includes("oracle"))
        || (category === "group:funding" && alert.category.toLowerCase().includes("funding"))
        || (category === "group:oi" && alert.category.toLowerCase().includes("oi"))
      ),
    ),
    [alerts, level, asset, category],
  );

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const levelParam = params.get("level");
    const assetParam = params.get("asset");
    const categoryParam = params.get("category");
    if (levelParam) setLevel(levelParam);
    if (assetParam) setAsset(assetParam);
    if (categoryParam) setCategory(categoryParam);
  }, []);

  if (loading && !snapshot) {
    return <div className="text-sm text-muted-foreground">Loading alerts...</div>;
  }

  if (error || !snapshot) {
    return (
      <Card className="bg-card/50 border-destructive/30 tech-border">
        <CardHeader>
          <CardTitle className="text-destructive">Alert feed unavailable</CardTitle>
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
          <h2 className="text-3xl font-bold tracking-tight text-primary uppercase">System Alerts</h2>
          <p className="text-muted-foreground">Incident stream, operator actions, and recovery state are now driven by a shared backend snapshot.</p>
        </div>
        <Button variant="outline" className="border-primary/40 text-primary hover:bg-primary/10" onClick={() => void refresh()}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      </div>

      <Card className="bg-card/50 border-primary/20 tech-border">
        <CardHeader>
          <CardTitle className="text-primary flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Select value={level} onValueChange={setLevel}>
            <SelectTrigger className="bg-background/50 border-primary/20">
              <SelectValue placeholder="Filter by level" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All levels</SelectItem>
              <SelectItem value="l1">L1</SelectItem>
              <SelectItem value="l2">L2</SelectItem>
              <SelectItem value="l3">L3</SelectItem>
            </SelectContent>
          </Select>
          <Select value={asset} onValueChange={setAsset}>
            <SelectTrigger className="bg-background/50 border-primary/20">
              <SelectValue placeholder="Filter by asset" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All assets</SelectItem>
              {Array.from(new Set(alerts.map((alert) => alert.assetSymbol))).map((symbol) => (
                <SelectItem key={symbol} value={symbol}>{symbol}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="bg-background/50 border-primary/20">
              <SelectValue placeholder="Filter by category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {Array.from(new Set(alerts.map((alert) => alert.category))).sort().map((item) => (
                <SelectItem key={item} value={item}>{item}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        {categoryQuickFilters.map((filter) => {
          const active = filter.key === "all"
            ? category === "all"
            : category === `group:${filter.key}`;
          return (
            <button
              key={filter.key}
              type="button"
              onClick={() => setCategory(
                filter.key === "all"
                  ? "all"
                  : filter.key === "oracle"
                    ? "group:oracle"
                    : filter.key === "funding"
                      ? "group:funding"
                      : "group:oi",
              )}
              className={`rounded border px-3 py-2 text-sm transition-all ${
                active
                  ? "border-primary/50 bg-primary/20 text-primary"
                  : "border-primary/20 bg-background/50 text-muted-foreground hover:border-primary/30"
              }`}
            >
              {filter.label} ({quickFilterCounts[filter.key] ?? 0})
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Card className="bg-card/50 border-primary/20 tech-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Critical</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{levelSummary.l3}</div>
            <p className="mt-1 text-xs text-muted-foreground">L3 incidents</p>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-primary/20 tech-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">High</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-500">{levelSummary.l2}</div>
            <p className="mt-1 text-xs text-muted-foreground">L2 incidents</p>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-primary/20 tech-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Advisory</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-500">{levelSummary.l1}</div>
            <p className="mt-1 text-xs text-muted-foreground">L1 incidents</p>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-primary/20 tech-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">{levelSummary.active}</div>
            <p className="mt-1 text-xs text-muted-foreground">Non-resolved incidents</p>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-card/50 border-primary/20 tech-border">
        <CardHeader>
          <CardTitle className="text-primary">Alert Source Guide</CardTitle>
          <CardDescription>Interpret category and signal-source labels directly from the incident page.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <div className="rounded border border-border bg-background/40 p-3">
            <div className="text-sm font-medium text-foreground">Category meaning</div>
            <div className="mt-2 space-y-2 text-xs text-muted-foreground">
              <div><span className="text-foreground">Oracle divergence</span>: protocol price vs external venue reference gap.</div>
              <div><span className="text-foreground">Funding divergence</span>: protocol funding posture vs live or runtime benchmark.</div>
              <div><span className="text-foreground">Funding stale</span>: funding state age is too old for comfort.</div>
              <div><span className="text-foreground">OI counter missing/dust</span>: direct position counters are not sufficiently usable.</div>
            </div>
          </div>
          <div className="rounded border border-border bg-background/40 p-3">
            <div className="text-sm font-medium text-foreground">Signal source meaning</div>
            <div className="mt-2 space-y-2 text-xs text-muted-foreground">
              <div><span className="text-foreground">Binance Futures</span>: live venue comparison source.</div>
              <div><span className="text-foreground">runtime benchmark</span>: derived from protocol/runtime state.</div>
              <div><span className="text-foreground">protocol funding state</span>: direct DataStore funding state.</div>
              <div><span className="text-foreground">protocol OI diagnostics</span>: direct protocol counter availability checks.</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-card/50 border-primary/20 tech-border">
        <CardHeader>
          <CardTitle className="text-primary">Category Breakdown</CardTitle>
          <CardDescription>Live incident counts grouped by category.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          {categorySummary.map((item) => (
            <div key={item.name} className="rounded border border-border bg-background/40 p-3">
              <div className="text-xs text-muted-foreground">{item.name}</div>
              <div className="mt-2 text-2xl font-bold text-primary">{item.count}</div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList className="bg-card/50 border border-primary/20">
          <TabsTrigger value="active">Incidents</TabsTrigger>
          <TabsTrigger value="actions">Operator Actions</TabsTrigger>
          <TabsTrigger value="recovery">Recovery</TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="space-y-4">
          {filteredAlerts.map((alert) => (
            <Card key={alert.id} className="bg-card/50 border-primary/20 tech-border">
              <CardHeader>
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-primary">
                      <AlertTriangle className="h-5 w-5" />
                      {alert.title}
                    </CardTitle>
                    <CardDescription>
                      {alert.assetSymbol} · {alert.category} · {alert.triggeredAt}
                    </CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Badge className={levelBadge(alert.level)}>{alert.level.toUpperCase()}</Badge>
                    <Badge variant="outline" className="border-primary/30 text-primary">{alert.status}</Badge>
                    <Badge variant="outline" className={analyticsBadge(snapshot.markets.find((market) => market.symbol === alert.assetSymbol)?.analyticsSource ?? "seeded-fallback")}>{(snapshot.markets.find((market) => market.symbol === alert.assetSymbol)?.analyticsSource ?? "seeded-fallback") === "runtime-derived" ? "runtime signal" : "fallback signal"}</Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <p className="text-muted-foreground">{alert.description}</p>
                <div className="space-y-1 text-xs text-muted-foreground"><div>Signal source: {alert.signalSource}</div><div>{explainSignalSource(alert.signalSource)}</div><div>{explainCategory(alert.category)}</div></div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <div className="rounded border border-border bg-background/40 p-3">
                    <div className="text-xs text-muted-foreground">Metric</div>
                    <div className="mt-1 font-semibold">{alert.metricValue.toFixed(2)}</div>
                  </div>
                  <div className="rounded border border-border bg-background/40 p-3">
                    <div className="text-xs text-muted-foreground">Threshold</div>
                    <div className="mt-1 font-semibold">{alert.thresholdValue.toFixed(2)}</div>
                  </div>
                  <div className="rounded border border-border bg-background/40 p-3">
                    <div className="text-xs text-muted-foreground">Suggested response</div>
                    <div className="mt-1 font-semibold">{alert.actionSummary}</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="actions" className="space-y-4">
          {snapshot.actions.map((action) => (
            <Card key={action.id} className="bg-card/50 border-primary/20 tech-border">
              <CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="font-semibold text-primary">{action.assetSymbol}</div>
                  <div className="text-sm text-muted-foreground">{action.action}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{action.beforeValue} → {action.afterValue}</div>
                </div>
                <div className="flex gap-2">
                  <Badge variant="outline" className="border-primary/30 text-primary">{action.timestamp}</Badge>
                  <Badge className={action.status === "executed" ? "bg-primary/20 text-primary border-primary/30" : "bg-yellow-500/20 text-yellow-500 border-yellow-500/30"}>{action.status}</Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="recovery" className="space-y-4">
          {snapshot.recovery.map((item) => (
            <Card key={item.id} className="bg-card/50 border-primary/20 tech-border">
              <CardHeader>
                <CardTitle className="text-primary flex items-center gap-2">
                  <ShieldAlert className="h-5 w-5" />
                  {item.assetSymbol} recovery track
                </CardTitle>
                <CardDescription>{item.triggeredAt} · ETA {item.etaMinutes} minutes</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex gap-2">
                  <Badge className={levelBadge(item.level)}>{item.level.toUpperCase()}</Badge>
                  <Badge variant="outline" className="border-primary/30 text-primary">{item.status}</Badge>
                </div>
                <p className="text-sm text-muted-foreground">{item.nextStep}</p>
                <div className="rounded border border-border bg-background/40 p-3 text-sm text-muted-foreground">
                  {item.executedActions.join(" | ")}
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}
