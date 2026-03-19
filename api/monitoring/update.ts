function sendJson(res: any, status: number, payload: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    sendJson(res, 405, { ok: false, error: "method_not_allowed" });
    return;
  }

  try {
    // @ts-ignore runtime-built server bundle
    const mod = await import("../_lib/server-api.js");
    const payload = await mod.updateControlPayload(req.body ?? {});
    sendJson(res, 200, payload);
  } catch (error) {
    console.error("monitor update route failed", error);
    sendJson(res, 500, {
      ok: false,
      error: error instanceof Error ? error.message : String(error ?? "unknown_error"),
    });
  }
}
