import { useMemo, useState } from "react";
import { RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useMonitoring } from "@/contexts/MonitoringContext";
import type { MonitoringControlUpdateInput } from "@shared/monitoring";

type ParameterValueSource = "onchain" | "config-fallback" | "seeded-analytics" | "template" | "derived";

function alertBadge(level: string) {
  if (level === "l3") return "bg-destructive/20 text-destructive border-destructive/40";
  if (level === "l2") return "bg-orange-500/20 text-orange-500 border-orange-500/40";
  if (level === "l1") return "bg-yellow-500/20 text-yellow-500 border-yellow-500/40";
  return "bg-primary/20 text-primary border-primary/30";
}

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

export default function ParametersEnhanced() {
  const { snapshot, loading, error, refresh, updateControl } = useMonitoring();
  const [search, setSearch] = useState("");
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const parameters = snapshot?.parameters ?? [];
  const filtered = useMemo(
    () => parameters.filter((item) => item.symbol.toLowerCase().includes(search.toLowerCase()) || item.tier.toLowerCase().includes(search.toLowerCase())),
    [parameters, search],
  );
  const selected = useMemo(() => filtered.find((item) => item.symbol === (selectedSymbol ?? filtered[0]?.symbol)) ?? null, [filtered, selectedSymbol]);

  const saveField = async (fieldKey: string, currentValue: string | number | boolean) => {
    if (!selected) return;
    const raw = promptValue(currentValue);
    if (raw == null) return;

    const payload: MonitoringControlUpdateInput = {
      surface: "parameters",
      symbol: selected.symbol,
      fieldKey,
      value: typeof currentValue === "boolean" ? raw : Number(raw),
    };

    setSavingKey(`${selected.symbol}:${fieldKey}`);
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
    return <div className="text-sm text-muted-foreground">Loading parameter book...</div>;
  }

  if (error || !snapshot) {
    return (
      <Card className="bg-card/50 border-destructive/30 tech-border">
        <CardHeader>
          <CardTitle className="text-destructive">Parameter snapshot unavailable</CardTitle>
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

  const categories = Array.from(new Set(snapshot.parameterDefinitions.map((definition) => definition.category)));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-primary uppercase">Risk Parameters</h2>
          <p className="text-muted-foreground">Per-market risk controls now show the actual FX100 key mapping. Direct edits are only enabled for fields backed by a writable onchain key.</p>
        </div>
        <Button variant="outline" className="border-primary/40 text-primary hover:bg-primary/10" onClick={() => void refresh()}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      </div>

      <div className="rounded border border-border bg-background/40 p-4 text-sm text-muted-foreground">
        <div>Write path: {snapshot.environment.writeEnabled ? "enabled" : "disabled"}</div>
        <div>If disabled, set <code>FX100_MONITOR_WRITE_PRIVATE_KEY</code> or a compatible deployer key in the monitor runtime.</div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <Card className="bg-card/50 border-primary/20 tech-border">
          <CardHeader>
            <CardTitle className="text-primary">Market Parameter Book</CardTitle>
            <CardDescription>Search a market and inspect baseline/current/recommended values plus the underlying FX100 key mapping.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-10 bg-background/50 border-primary/20" placeholder="Search by symbol or tier" value={search} onChange={(event) => setSearch(event.target.value)} />
            </div>
            <div className="space-y-3">
              {filtered.map((item) => (
                <button
                  key={item.symbol}
                  type="button"
                  onClick={() => setSelectedSymbol(item.symbol)}
                  className={`w-full rounded border p-3 text-left transition-colors ${selected?.symbol === item.symbol ? "border-primary/50 bg-primary/10" : "border-border bg-background/40 hover:border-primary/25"}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="font-semibold">{item.symbol}</div>
                      <div className="text-xs text-muted-foreground">{item.tier}</div>
                    </div>
                    <Badge className={alertBadge(item.alertLevel)}>{item.alertLevel.toUpperCase()}</Badge>
                  </div>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/50 border-primary/20 tech-border">
          <CardHeader>
            <CardTitle className="text-primary">Parameter Diff Matrix</CardTitle>
            <CardDescription>{selected ? `${selected.symbol} current vs baseline vs recommended` : "Select a market"}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {selected ? categories.map((category) => {
              const defs = snapshot.parameterDefinitions.filter((definition) => definition.category === category);
              return (
                <div key={category} className="space-y-3">
                  <div className="text-sm font-semibold text-primary uppercase tracking-wide">{category}</div>
                  <div className="overflow-x-auto rounded border border-border bg-background/40">
                    <table className="min-w-full text-sm">
                      <thead className="border-b border-border text-xs uppercase text-muted-foreground">
                        <tr>
                          <th className="px-4 py-3 text-left">Field</th>
                          <th className="px-4 py-3 text-right">Baseline</th>
                          <th className="px-4 py-3 text-right">Current</th>
                          <th className="px-4 py-3 text-right">Recommended</th>
                        </tr>
                      </thead>
                      <tbody>
                        {defs.map((definition) => {
                          const writable = definition.writable === true && snapshot.environment.writeEnabled === true;
                          const value = selected.current[definition.key];
                          const rowSavingKey = `${selected.symbol}:${definition.key}`;
                          return (
                            <tr key={definition.key} className="border-b border-border/60 last:border-b-0 align-top">
                              <td className="px-4 py-3 text-muted-foreground">
                                <div>{definition.label}</div>
                                <div className="mt-1 text-xs font-mono text-primary">{definition.keyName ?? "Unmapped"}</div>
                                <div className="mt-1 text-xs text-muted-foreground/80">{definition.keyPath}</div>
                                {!definition.writable && definition.writableReason ? <div className="mt-1 text-xs text-orange-400">{definition.writableReason}</div> : null}
                              </td>
                              <td className="px-4 py-3 text-right">
                                <div>{formatValue(selected.baseline[definition.key], definition.unit)}</div>
                                <div className="mt-1 flex justify-end">
                                  <Badge variant="outline" className={sourceBadge(selected.baselineSources[definition.key])}>{sourceLabel(selected.baselineSources[definition.key])}</Badge>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-right text-foreground">
                                <div>{formatValue(value, definition.unit)}</div>
                                <div className="mt-1 flex justify-end gap-2">
                                  <Badge variant="outline" className={sourceBadge(selected.currentSources[definition.key])}>{sourceLabel(selected.currentSources[definition.key])}</Badge>
                                  {definition.writable ? <Badge variant="outline" className="border-primary/30 text-primary">editable</Badge> : null}
                                </div>
                                {definition.writable ? (
                                  <div className="mt-2 flex justify-end">
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      disabled={!writable || savingKey === rowSavingKey}
                                      onClick={() => void saveField(definition.key, value)}
                                    >
                                      {savingKey === rowSavingKey ? "Saving..." : "Edit"}
                                    </Button>
                                  </div>
                                ) : null}
                              </td>
                              <td className="px-4 py-3 text-right text-primary">
                                <div>{formatValue(selected.recommended[definition.key], definition.unit)}</div>
                                <div className="mt-1 flex justify-end">
                                  <Badge variant="outline" className={sourceBadge(selected.recommendedSources[definition.key])}>{sourceLabel(selected.recommendedSources[definition.key])}</Badge>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            }) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
