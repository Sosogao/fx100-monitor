import type { MonitoringSnapshot } from "../shared/monitoring";
import { appendHistoryPoint, applyHistoricalSeries, loadHistory, snapshotToHistoryPoint } from "./data/history";
import { buildMonitoringSnapshot } from "./data/snapshot";
import { basefx100Sepolia0312 } from "./config/fx100";

const SNAPSHOT_TTL_MS = 15_000;

let cachedSnapshot: Awaited<ReturnType<typeof buildMonitoringSnapshot>> | null = null;
let cachedAt = 0;

function buildDegradedSnapshot(error: unknown): MonitoringSnapshot {
  const generatedAt = new Date().toISOString();
  const message = error instanceof Error ? error.message : "unknown_error";

  return {
    generatedAt,
    environment: {
      name: basefx100Sepolia0312.name,
      network: basefx100Sepolia0312.network,
      mode: "demo-backed-api",
      source: `degraded snapshot fallback: ${message}`,
      updatedAt: generatedAt,
      refreshIntervalSec: 30,
      readStatus: "fallback",
    },
    dashboard: {
      stats: [
        { label: "Markets", value: String(basefx100Sepolia0312.markets.length), tone: "warning" },
        { label: "Snapshot Mode", value: "Fallback", tone: "warning" },
        { label: "Live RPC", value: "Unavailable", tone: "critical" },
      ],
      exposureSeries: [],
      priorityMarkets: [],
      notes: [
        {
          title: "Snapshot degraded",
          body: `The serverless runtime could not build the live monitoring snapshot. Returned fallback payload so the UI stays available. Error: ${message}`,
          tone: "critical",
        },
      ],
    },
    markets: [],
    marketSeries: [],
    alerts: [],
    actions: [],
    recovery: [],
    parameterDefinitions: [],
    parameters: [],
    protocolOpsDefinitions: [],
    protocolOps: { current: {}, currentSources: {} },
  };
}

async function refreshSnapshot(force = false) {
  const now = Date.now();
  if (!force && cachedSnapshot && now - cachedAt < SNAPSHOT_TTL_MS) {
    return cachedSnapshot;
  }

  try {
    const snapshot = await buildMonitoringSnapshot();
    const history = await appendHistoryPoint(snapshot.environment.name, snapshotToHistoryPoint(snapshot));
    cachedSnapshot = applyHistoricalSeries(snapshot, history);
    cachedAt = now;
    return cachedSnapshot;
  } catch (error) {
    console.error("snapshot build failed", error);
    cachedSnapshot = buildDegradedSnapshot(error);
    cachedAt = now;
    return cachedSnapshot;
  }
}

export async function getSnapshotPayload(force = false) {
  return refreshSnapshot(force);
}

export async function getHistoryPayload() {
  const snapshot = await refreshSnapshot();
  const history = await loadHistory(snapshot.environment.name);
  return {
    ok: true,
    environment: snapshot.environment.name,
    points: history.length > 0 ? history : [snapshotToHistoryPoint(snapshot)],
  };
}

export function getHealthPayload() {
  return {
    ok: true,
    service: "fx100-monitor",
    mode: process.env.VERCEL ? "vercel-read-only" : "read-only",
  };
}
