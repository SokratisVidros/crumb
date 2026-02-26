import { Hono } from "hono";
import { decodeAndVerifyToken } from "./token";
import type { EventStore } from "./types";

const TRANSPARENT_GIF_BASE64 = "R0lGODlhAQABAIABAP///wAAACwAAAAAAQABAAACAkQBADs=";

const TRANSPARENT_GIF_BYTES = Uint8Array.from(Buffer.from(TRANSPARENT_GIF_BASE64, "base64"));

type TrackerConfig = {
  secret: string;
  apiKey: string;
  store: EventStore;
};

const readApiKey = (request: Request) => {
  const authHeader = request.headers.get("authorization");
  if (authHeader?.toLowerCase().startsWith("bearer ")) {
    return authHeader.slice(7).trim();
  }

  return request.headers.get("x-api-key") ?? request.headers.get("x-tracker-api-key") ?? "";
};

const readIp = (request: Request) => {
  const cfIp = request.headers.get("cf-connecting-ip");
  if (cfIp) {
    return cfIp;
  }

  const xForwardedFor = request.headers.get("x-forwarded-for");
  if (!xForwardedFor) {
    return undefined;
  }

  return xForwardedFor.split(",")[0]?.trim() || undefined;
};

export const createTracker = (config: TrackerConfig) => {
  const app = new Hono();

  app.get("/t/*", async (c) => {
    const rawPixelPart = c.req.path.split("/").pop() ?? "";
    const token = rawPixelPart.endsWith(".gif") ? rawPixelPart.slice(0, -4) : rawPixelPart;

    if (!token) {
      return c.body(TRANSPARENT_GIF_BYTES, 200, {
        "Content-Type": "image/gif",
        "Content-Length": String(TRANSPARENT_GIF_BYTES.byteLength),
      });
    }

    const parsed = decodeAndVerifyToken({
      token,
      secret: config.secret,
    });

    if (parsed) {
      await config.store.recordEvent({
        runId: parsed.runId,
        stepId: parsed.stepId,
        event: "open",
        userAgent: c.req.header("user-agent") ?? undefined,
        ip: readIp(c.req.raw),
      });
    }

    c.header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
    c.header("Pragma", "no-cache");
    c.header("Expires", "0");
    return c.body(TRANSPARENT_GIF_BYTES, 200, {
      "Content-Type": "image/gif",
      "Content-Length": String(TRANSPARENT_GIF_BYTES.byteLength),
    });
  });

  app.get("/r/:token", async (c) => {
    const token = c.req.param("token");
    const targetUrl = c.req.query("url");
    if (!token) {
      return c.json({ error: "invalid_tracking_link" }, 400);
    }

    const parsed = decodeAndVerifyToken({
      token,
      secret: config.secret,
    });

    if (!parsed || !targetUrl) {
      return c.json({ error: "invalid_tracking_link" }, 400);
    }

    await config.store.recordEvent({
      runId: parsed.runId,
      stepId: parsed.stepId,
      event: "click",
      url: targetUrl,
      userAgent: c.req.header("user-agent") ?? undefined,
      ip: readIp(c.req.raw),
    });

    return c.redirect(targetUrl, 302);
  });

  app.get("/api/events/:token", async (c) => {
    const apiKey = readApiKey(c.req.raw);
    if (!apiKey || apiKey !== config.apiKey) {
      return c.json({ error: "unauthorized" }, 401);
    }

    const token = c.req.param("token");
    if (!token) {
      return c.json({ error: "invalid_token" }, 400);
    }

    const parsed = decodeAndVerifyToken({
      token,
      secret: config.secret,
    });

    if (!parsed) {
      return c.json({ error: "invalid_token" }, 400);
    }

    const event = await config.store.getEvent({
      runId: parsed.runId,
      stepId: parsed.stepId,
    });

    if (!event) {
      return c.json({ found: false });
    }

    return c.json({ found: true, data: event });
  });

  app.get("/", (c) => c.json({ ok: true }));

  return app;
};
