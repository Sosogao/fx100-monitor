import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { MonitoringSnapshot } from "@shared/monitoring";

interface MonitoringContextValue {
  snapshot: MonitoringSnapshot | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
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

  useEffect(() => {
    void load();
  }, []);

  const value = useMemo(
    () => ({ snapshot, loading, error, refresh: load }),
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
