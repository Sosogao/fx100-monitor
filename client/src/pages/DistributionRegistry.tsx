import { RefreshCw } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useMonitoring } from "@/contexts/MonitoringContext";

type ParameterValueSource = "onchain" | "config-fallback" | "seeded-analytics" | "template" | "derived";

function formatValue(value: string | number | boolean) {
  if (typeof value === "boolean") return value ? "Enabled" : "Disabled";
  if (typeof value === "number") {
    return Math.abs(value) >= 1000 ? Intl.NumberFormat("en-US").format(Number(value.toFixed(0))) : Number(value.toFixed(2)).toString();
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

export default function DistributionRegistry() {
  const { snapshot, loading, error, refresh } = useMonitoring();

  if (loading && !snapshot) return <div className="text-sm text-muted-foreground">Loading distribution registry...</div>;

  if (error || !snapshot) {
    return (
      <Card className="bg-card/50 border-destructive/30 tech-border">
        <CardHeader>
          <CardTitle className="text-destructive">Distribution registry unavailable</CardTitle>
          <CardDescription>{error ?? "No monitoring data returned."}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={() => void refresh()}>
            <RefreshCw className="mr-2 h-4 w-4" />Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-primary uppercase">Distribution Registry</h2>
          <p className="text-muted-foreground">Enumerable and probe-based Keys2 registry entries. Opaque address-name mappings are intentionally excluded unless explicit probe inputs are configured.</p>
        </div>
        <Button variant="outline" className="border-primary/40 text-primary hover:bg-primary/10" onClick={() => void refresh()}>
          <RefreshCw className="mr-2 h-4 w-4" />Refresh
        </Button>
      </div>

      {snapshot.distributionRegistry.map((section) => (
        <Card key={section.title} className="bg-card/50 border-primary/20 tech-border">
          <CardHeader>
            <CardTitle className="text-primary">{section.title}</CardTitle>
            <CardDescription>{section.description}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded border border-border bg-background/40">
              <table className="min-w-full text-sm">
                <thead className="border-b border-border text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 text-left">Probe</th>
                    <th className="px-4 py-3 text-right">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {section.rows.map((row) => (
                    <tr key={`${section.title}-${row.label}`} className="border-b border-border/60 last:border-b-0 align-top">
                      <td className="px-4 py-3 text-muted-foreground">
                        <div>{row.label}</div>
                        {row.detail ? <div className="mt-1 text-xs text-muted-foreground/80">{row.detail}</div> : null}
                      </td>
                      <td className="px-4 py-3 text-right text-foreground">
                        <div>{formatValue(row.value)}</div>
                        <div className="mt-1 flex justify-end">
                          <Badge variant="outline" className={sourceBadge(row.source)}>{sourceLabel(row.source)}</Badge>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
