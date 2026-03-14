import { getHealthPayload } from "../server/api";

function sendJson(res: any, status: number, payload: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}

export default async function handler(_req: any, res: any) {
  try {
    sendJson(res, 200, getHealthPayload());
  } catch {
    sendJson(res, 200, { ok: true, service: "fx100-monitor", mode: "vercel-read-only" });
  }
}
