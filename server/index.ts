import express from "express";
import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";
import { buildMonitoringSnapshot } from "./data/snapshot.ts";
import { appendHistoryPoint, applyHistoricalSeries, loadHistory, snapshotToHistoryPoint } from "./data/history.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const server = createServer(app);
  let cachedSnapshot = null as Awaited<ReturnType<typeof buildMonitoringSnapshot>> | null;

  async function refreshSnapshot() {
    const snapshot = await buildMonitoringSnapshot();
    const history = await appendHistoryPoint(snapshot.environment.name, snapshotToHistoryPoint(snapshot));
    cachedSnapshot = applyHistoricalSeries(snapshot, history);
    return cachedSnapshot;
  }

  const staticPath =
    process.env.NODE_ENV === "production"
      ? path.resolve(__dirname, "public")
      : path.resolve(__dirname, "..", "dist", "public");

  app.use(express.json());

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, service: "fx100-monitor", mode: "read-only" });
  });

  app.get("/api/monitoring/snapshot", async (_req, res, next) => {
    try {
      const snapshot = cachedSnapshot ?? await refreshSnapshot();
      res.setHeader("Cache-Control", "no-store");
      res.json(snapshot);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/monitoring/history", async (_req, res, next) => {
    try {
      const snapshot = cachedSnapshot ?? await refreshSnapshot();
      const history = await loadHistory(snapshot.environment.name);
      res.setHeader("Cache-Control", "no-store");
      res.json({ ok: true, environment: snapshot.environment.name, points: history });
    } catch (error) {
      next(error);
    }
  });

  app.use(express.static(staticPath));

  app.get("*", (_req, res) => {
    res.sendFile(path.join(staticPath, "index.html"));
  });

  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(error);
    res.status(500).json({ ok: false, error: "internal_server_error" });
  });

  await refreshSnapshot();
  setInterval(() => {
    void refreshSnapshot().catch((error) => console.error("snapshot refresh failed", error));
  }, Math.max((cachedSnapshot?.environment.refreshIntervalSec ?? 30) * 1000, 15_000));

  const port = Number(process.env.PORT || 3000);
  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
