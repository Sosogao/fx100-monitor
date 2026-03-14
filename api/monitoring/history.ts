import { getHistoryPayload } from "../../dist/server-api.js";

function sendJson(res: any, status: number, payload: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}

export default async function handler(_req: any, res: any) {
  try {
    const payload = await getHistoryPayload();
    sendJson(res, 200, payload);
  } catch (error) {
    console.error("history route failed", error);
    sendJson(res, 200, { ok: true, environment: "fx100Base49b34c09", points: [] });
  }
}
