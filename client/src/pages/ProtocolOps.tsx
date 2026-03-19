import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useMonitoring } from "@/contexts/MonitoringContext";
import type { MonitoringControlUpdateInput } from "@shared/monitoring";

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

function promptValue(currentValue: string | number | boolean) {
  const next = window.prompt("Set new value", String(currentValue));
  if (next == null) return null;
  return next.trim();
}

export default function ProtocolOps() {
  const { snapshot, loading, error, refresh, updateControl } = useMonitoring();
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const saveField = async (fieldKey: string, currentValue: string | number | boolean) => {
    const raw = promptValue(currentValue);
    if (raw == null) return;
    const payload: MonitoringControlUpdateInput = {
      surface: "protocol-ops",
      fieldKey,
      value: typeof currentValue === "boolean" ? raw : Number(raw),
    };

    setSavingKey(fieldKey);
    try {
      const result = await updateControl(payload);
      toast.success(`${fieldKey} updated`, { description: `${result.keyName} -> ${result.txHash.slice(0, 10)}...` });
      await refresh();
    } catch (updateError) {
      toast.error(updateError instanceof Error ? updateError.message : "update failed");
    } finally {
      setSavingKey(null);
    }
  };

  if (loading && !snapshot) {
    return <div className="text-sm text-muted-foreground">Loading protocol ops...</div>;
  }

  if (error || !snapshot) {
    return (
      <Card className="bg-card/50 border-destructive/30 tech-border">
        <CardHeader>
          <CardTitle className="text-destructive">Protocol ops snapshot unavailable</CardTitle>
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

  const categories = Array.from(new Set(snapshot.protocolOpsDefinitions.map((definition) => definition.category)));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-primary uppercase">Protocol Ops</h2>
          <p className="text-muted-foreground">Global oracle, execution, and feature-flag controls separated from market-level risk parameters. Writable fields can be changed directly from this page.</p>
        </div>
        <Button variant="outline" className="border-primary/40 text-primary hover:bg-primary/10" onClick={() => void refresh()}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      </div>

      <Card className="bg-card/50 border-primary/20 tech-border">
        <CardHeader>
          <CardTitle className="text-primary">Protocol Control Plane</CardTitle>
          <CardDescription>These values come from global DataStore keys and should not be mixed with per-market risk parameters.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {categories.map((category) => {
            const defs = snapshot.protocolOpsDefinitions.filter((definition) => definition.category === category);
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
                      {defs.map((definition) => {
                        const value = snapshot.protocolOps.current[definition.key];
                        const writable = definition.writable === true && snapshot.environment.writeEnabled === true;
                        return (
                          <tr key={definition.key} className="border-b border-border/60 last:border-b-0 align-top">
                            <td className="px-4 py-3 text-muted-foreground">
                              <div>{definition.label}</div>
                              <div className="mt-1 text-xs font-mono text-primary">{definition.keyName ?? "Unmapped"}</div>
                              <div className="mt-1 text-xs text-muted-foreground/80">{definition.keyPath}</div>
                              {!definition.writable && definition.writableReason ? <div className="mt-1 text-xs text-orange-400">{definition.writableReason}</div> : null}
                            </td>
                            <td className="px-4 py-3 text-right text-foreground">
                              <div>{formatValue(value, definition.unit)}</div>
                              <div className="mt-1 flex justify-end gap-2">
                                <Badge variant="outline" className={sourceBadge(snapshot.protocolOps.currentSources[definition.key])}>
                                  {sourceLabel(snapshot.protocolOps.currentSources[definition.key])}
                                </Badge>
                                {definition.writable ? <Badge variant="outline" className="border-primary/30 text-primary">editable</Badge> : null}
                              </div>
                              {definition.writable ? (
                                <div className="mt-2 flex justify-end">
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    disabled={!writable || savingKey === definition.key}
                                    onClick={() => void saveField(definition.key, value)}
                                  >
                                    {savingKey === definition.key ? "Saving..." : "Edit"}
                                  </Button>
                                </div>
                              ) : null}
                            </td>
                          </tr>
                        );
                      })}
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
