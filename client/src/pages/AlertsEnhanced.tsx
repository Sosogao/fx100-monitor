import { useMemo, useState } from "react";
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

export default function AlertsEnhanced() {
  const { snapshot, loading, error, refresh } = useMonitoring();
  const [tab, setTab] = useState("active");
  const [level, setLevel] = useState("all");
  const [asset, setAsset] = useState("all");

  const alerts = snapshot?.alerts ?? [];
  const filteredAlerts = useMemo(
    () => alerts.filter((alert) => (level === "all" || alert.level === level) && (asset === "all" || alert.assetSymbol === asset)),
    [alerts, level, asset],
  );

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
        <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
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
                <div className="text-xs text-muted-foreground">Signal source: {alert.signalSource}</div>
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
