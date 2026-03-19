import { RefreshCw } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ResearchInfo } from "@/components/ResearchInfo";
import { useMonitoring } from "@/contexts/MonitoringContext";

type ParameterValueSource = "onchain" | "config-fallback" | "seeded-analytics" | "template" | "derived";

function formatValue(value: string | number | boolean, unit: string) {
  if (typeof value === "boolean") return value ? "Enabled" : "Disabled";
  if (typeof value === "number") {
    const formatted = Math.abs(value) >= 1000 ? Intl.NumberFormat("en-US").format(Number(value.toFixed(0))) : Number(value.toFixed(2)).toString();
    return unit === "$" ? `$${formatted}` : `${formatted}${unit ? ` ${unit}` : ""}`;
  }
  return value;
}

function sourceBadge(source: ParameterValueSource) {
  switch (source) {
    case "onchain":
      return "bg-primary/20 text-primary border-primary/30";
    case "config-fallback":
      return "bg-orange-500/20 text-orange-400 border-orange-500/30";
    case "seeded-analytics":
      return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
    case "template":
      return "bg-muted text-muted-foreground border-border";
    default:
      return "bg-sky-500/20 text-sky-400 border-sky-500/30";
  }
}

function sourceLabel(source: ParameterValueSource) {
  switch (source) {
    case "onchain":
      return "onchain";
    case "config-fallback":
      return "config";
    case "seeded-analytics":
      return "seeded";
    case "template":
      return "template";
    default:
      return "derived";
  }
}

function docHrefForDistributionOps() {
  return "https://github.com/Sosogao/fx100-monitor/blob/main/docs/operator-troubleshooting.md";
}

export default function DistributionOps() {
  const { snapshot, loading, error, refresh } = useMonitoring();

  if (loading && !snapshot) {
    return <div className="text-sm text-muted-foreground">Loading distribution ops...</div>;
  }

  if (error || !snapshot) {
    return (
      <Card className="bg-card/50 border-destructive/30 tech-border">
        <CardHeader>
          <CardTitle className="text-destructive">Distribution ops snapshot unavailable</CardTitle>
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

  const categories = Array.from(new Set(snapshot.distributionOpsDefinitions.map((definition) => definition.category)));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-primary uppercase">Distribution Ops</h2>
          <p className="text-muted-foreground">Keys2-backed MultichainReader and FeeDistributor controls, separated from market risk and protocol-global execution settings.</p>
        </div>
        <Button variant="outline" className="border-primary/40 text-primary hover:bg-primary/10" onClick={() => void refresh()}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      </div>

      <Card className="bg-card/50 border-primary/20 tech-border">
        <CardHeader>
          <CardTitle className="text-primary">Keys2 Control Plane</CardTitle>
          <CardDescription>These values come from additional DataStore keys used by MultichainReader and FeeDistributor. They are operational settings, not per-market risk controls.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {categories.map((category) => {
            const defs = snapshot.distributionOpsDefinitions.filter((definition) => definition.category === category);
            return (
              <div key={category} className="space-y-3">
                <div className="text-sm font-semibold text-primary uppercase tracking-wide">{category}</div>
                <div className="overflow-x-auto rounded border border-border bg-background/40">
                  <table className="min-w-full text-sm">
                    <thead className="border-b border-border text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="px-4 py-3 text-left">Field</th>
                        <th className="px-4 py-3 text-right">Current</th>
                      </tr>
                    </thead>
                    <tbody>
                      {defs.map((definition) => (
                        <tr key={definition.key} className="border-b border-border/60 last:border-b-0 align-top">
                          <td className="px-4 py-3 text-muted-foreground">
                            <div>{definition.label}</div>
                            <ResearchInfo
                              businessMeaning={definition.businessMeaning}
                              riskControlled={definition.riskControlled}
                              formula={definition.formula}
                              runtimeStatus={definition.runtimeStatus}
                              testStatus={definition.testStatus}
                              docHref={definition.docHref ?? docHrefForDistributionOps()}
                            />
                          </td>
                          <td className="px-4 py-3 text-right text-foreground">
                            <div>{formatValue(snapshot.distributionOps.current[definition.key], definition.unit)}</div>
                            <div className="mt-1 flex justify-end">
                              <Badge variant="outline" className={sourceBadge(snapshot.distributionOps.currentSources[definition.key])}>
                                {sourceLabel(snapshot.distributionOps.currentSources[definition.key])}
                              </Badge>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
