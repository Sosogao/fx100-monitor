function sendJson(res: any, status: number, payload: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}

function degradedSnapshot(error: unknown) {
  const generatedAt = new Date().toISOString();
  const message = error instanceof Error ? error.message : String(error ?? "unknown_error");

  return {
    generatedAt,
    environment: {
      name: "fx100Base49b34c09",
      network: "Tenderly Virtual TestNet (Base fork)",
      mode: "demo-backed-api",
      source: `handler fallback: ${message}`,
      updatedAt: generatedAt,
      refreshIntervalSec: 30,
      readStatus: "fallback",
    },
    dashboard: {
      stats: [
        { label: "Markets", value: "0", tone: "warning" },
        { label: "Snapshot Mode", value: "Fallback", tone: "warning" },
        { label: "Live RPC", value: "Unavailable", tone: "critical" }
      ],
      exposureSeries: [],
      priorityMarkets: [],
      notes: [
        {
          title: "Snapshot degraded",
          body: `The Vercel function could not build the live snapshot. Error: ${message}`,
          tone: "critical"
        }
      ]
    },
    markets: [],
    marketSeries: [],
    alerts: [],
    actions: [],
    recovery: [],
    parameterDefinitions: [],
    parameters: [],
  };
}

export default async function handler(_req: any, res: any) {
  try {
    const mod = await import("../../server/api");
    const payload = await mod.getSnapshotPayload();
    sendJson(res, 200, payload);
  } catch (error) {
    console.error("snapshot route failed", error);
    sendJson(res, 200, degradedSnapshot(error));
  }
}
