import { Hono } from "hono";
import { getBorderCharacters, table } from "table";
import { getTrackingContext } from "./request-context";
import { decodeAndVerifyToken } from "./token";
import { type EventRecord, type EventStore, mergeTrackingParams } from "./types";

const isDev = () => process.env.NODE_ENV === "development";

/** ASCII-only border for plain text in browser. */
const asciiBorder = getBorderCharacters("ramac");

function formatEventsAscii(events: EventRecord[]): string {
  const header = ["#", "runId", "stepId", "event", "url", "firedAt"];
  if (events.length === 0) {
    const emptyTable = table([header, ["-", "-", "-", "-", "-", "-"]], {
      border: asciiBorder,
    });
    return `\n  Latest 10 events (dev)\n\n${emptyTable}\n`;
  }
  const rows = events.map((e, i) => {
    const url = e.url ?? "-";
    const firedAt = e.firedAt instanceof Date ? e.firedAt.toISOString() : String(e.firedAt);
    return [String(i + 1), e.runId, e.stepId, e.event, url, firedAt];
  });
  const data = [header, ...rows];
  const out = table(data, { border: asciiBorder });
  return `\n  Latest 10 events (dev)\n\n${out}\n`;
}

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

function buildEventParams(
  runId: string,
  stepId: string,
  event: "open" | "click",
  request: Request,
  url?: string,
) {
  return mergeTrackingParams({ runId, stepId, event }, getTrackingContext(request), url);
}

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
      await config.store.recordEvent(
        buildEventParams(parsed.runId, parsed.stepId, "open", c.req.raw),
      );
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

    await config.store.recordEvent(
      buildEventParams(parsed.runId, parsed.stepId, "click", c.req.raw, targetUrl),
    );

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

  app.get("/", (c) => c.json({ ok: true, crumb: "🍞" }));

  app.get("/dev/events", async (c) => {
    if (!isDev()) {
      return c.json({ error: "not_found" }, 404);
    }
    const list =
      typeof config.store.getLatestEvents === "function"
        ? await config.store.getLatestEvents(10)
        : [];
    const body = formatEventsAscii(list);
    return c.text(body, 200, {
      "Content-Type": "text/plain; charset=utf-8",
    });
  });

  return app;
};
