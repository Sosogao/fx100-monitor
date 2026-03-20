function sendJson(res: any, status: number, payload: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}

export default async function handler(_req: any, res: any) {
  try {
    // @ts-ignore runtime-built server bundle
    const mod = await import("../_lib/server-api.js");
    const payload = await mod.getHistoryPayload();
    sendJson(res, 200, payload);
  } catch (error) {
    console.error("history route failed", error);
    sendJson(res, 200, { ok: true, environment: "fx100Base2", points: [] });
  }
}
