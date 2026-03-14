import type { IncomingMessage, ServerResponse } from "node:http";
import { getHistoryPayload } from "../../server/api.ts";

function sendJson(res: ServerResponse, status: number, payload: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}

export default async function handler(_req: IncomingMessage, res: ServerResponse) {
  try {
    sendJson(res, 200, await getHistoryPayload());
  } catch (error) {
    console.error(error);
    sendJson(res, 500, { ok: false, error: "internal_server_error" });
  }
}
