import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type {
  MonitoringControlUpdateInput,
  MonitoringControlUpdateResult,
  MonitoringSnapshot,
} from "@shared/monitoring";

interface MonitoringContextValue {
  snapshot: MonitoringSnapshot | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  updateControl: (input: MonitoringControlUpdateInput) => Promise<MonitoringControlUpdateResult>;
}

const MonitoringContext = createContext<MonitoringContextValue | undefined>(undefined);

export function MonitoringProvider({ children }: { children: React.ReactNode }) {
  const [snapshot, setSnapshot] = useState<MonitoringSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/monitoring/snapshot");
      if (!response.ok) {
        throw new Error(`snapshot request failed: ${response.status}`);
      }
      const data = (await response.json()) as MonitoringSnapshot;
      setSnapshot(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "unknown_error");
    } finally {
      setLoading(false);
    }
  };

  const updateControl = async (input: MonitoringControlUpdateInput) => {
    const response = await fetch("/api/monitoring/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });

    const payload = await response.json();
    if (!response.ok || payload?.ok === false) {
      throw new Error(payload?.error || `update request failed: ${response.status}`);
    }

    if (payload?.snapshot) {
      setSnapshot(payload.snapshot as MonitoringSnapshot);
    } else {
      await load();
    }

    return payload as MonitoringControlUpdateResult;
  };

  useEffect(() => {
    void load();
  }, []);

  const value = useMemo(
    () => ({ snapshot, loading, error, refresh: load, updateControl }),
    [snapshot, loading, error],
  );

  return <MonitoringContext.Provider value={value}>{children}</MonitoringContext.Provider>;
}

export function useMonitoring() {
  const context = useContext(MonitoringContext);
  if (!context) {
    throw new Error("useMonitoring must be used within MonitoringProvider");
  }
  return context;
}
