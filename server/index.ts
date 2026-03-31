import express from "express";
import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";
import { getHealthPayload, getHistoryPayload, getSnapshotPayload, updateControlPayload } from "./api";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const server = createServer(app);

  const staticPath =
    process.env.NODE_ENV === "production"
      ? path.resolve(__dirname, "public")
      : path.resolve(__dirname, "..", "dist", "public");

  app.use(express.json());

  app.get("/api/health", (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.json(getHealthPayload());
  });

  app.get("/api/monitoring/snapshot", async (_req, res, next) => {
    try {
      res.setHeader("Cache-Control", "no-store");
      res.json(await getSnapshotPayload());
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/monitoring/history", async (_req, res, next) => {
    try {
      res.setHeader("Cache-Control", "no-store");
      res.json(await getHistoryPayload());
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/monitoring/update", async (req, res, next) => {
    try {
      res.setHeader("Cache-Control", "no-store");
      res.json(await updateControlPayload(req.body));
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

  const port = Number(process.env.PORT || 3000);
  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
