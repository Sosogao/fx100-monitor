import type { IncomingMessage, ServerResponse } from "node:http";
import { getHealthPayload } from "../server/api.ts";

function sendJson(res: ServerResponse, status: number, payload: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}

export default async function handler(_req: IncomingMessage, res: ServerResponse) {
  sendJson(res, 200, getHealthPayload());
}
