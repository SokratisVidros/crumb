import { describe, expect, it } from "bun:test";
import { MemoryEventStore } from "./stores";
import { encodeToken } from "./token";
import { createTracker } from "./tracker";

const makeApp = () => {
  const store = new MemoryEventStore();
  const secret = "test-secret";
  const apiKey = "test-api-key";
  const app = createTracker({ store, secret, apiKey });
  return { app, store, secret, apiKey };
};

describe("tracker routes", () => {
  it("records open event on tracking pixel request", async () => {
    const { app, secret, apiKey } = makeApp();
    const token = encodeToken({
      runId: "run_open",
      stepId: "welcome:open",
      secret,
    });

    const pixelResponse = await app.request(`/t/${token}.gif`, {
      headers: { "user-agent": "test-agent" },
    });

    expect(pixelResponse.status).toBe(200);
    expect(pixelResponse.headers.get("content-type")).toContain("image/gif");

    const pollResponse = await app.request(`/api/events/${token}`, {
      headers: { authorization: `Bearer ${apiKey}` },
    });
    const payload = await pollResponse.json();

    expect(pollResponse.status).toBe(200);
    expect(payload.found).toBe(true);
    expect(payload.data.event).toBe("open");
    expect(payload.data.runId).toBe("run_open");
    expect(payload.data.stepId).toBe("welcome:open");
    expect(payload.data.userAgent).toBe("test-agent");
  });

  it("records click event and redirects to target URL", async () => {
    const { app, secret, apiKey } = makeApp();
    const token = encodeToken({
      runId: "run_click",
      stepId: "welcome:click",
      secret,
    });
    const targetUrl = "https://example.com/docs";

    const clickResponse = await app.request(`/r/${token}?url=${encodeURIComponent(targetUrl)}`, {
      headers: { "user-agent": "click-agent" },
      redirect: "manual",
    });

    expect(clickResponse.status).toBe(302);
    expect(clickResponse.headers.get("location")).toBe(targetUrl);

    const pollResponse = await app.request(`/api/events/${token}`, {
      headers: { "x-api-key": apiKey },
    });
    const payload = await pollResponse.json();

    expect(payload.found).toBe(true);
    expect(payload.data.event).toBe("click");
    expect(payload.data.url).toBe(targetUrl);
    expect(payload.data.userAgent).toBe("click-agent");
  });

  it("requires API key for polling endpoint", async () => {
    const { app, secret } = makeApp();
    const token = encodeToken({
      runId: "run_auth",
      stepId: "welcome:open",
      secret,
    });

    const response = await app.request(`/api/events/${token}`);
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload.error).toBe("unauthorized");
  });

  it("returns found false when no event is recorded yet", async () => {
    const { app, secret, apiKey } = makeApp();
    const token = encodeToken({
      runId: "run_none",
      stepId: "welcome:open",
      secret,
    });

    const response = await app.request(`/api/events/${token}`, {
      headers: { "x-tracker-api-key": apiKey },
    });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({ found: false });
  });

  it("records full tracking context when headers are present", async () => {
    const { app, secret, apiKey } = makeApp();
    const token = encodeToken({
      runId: "run_context",
      stepId: "welcome:open",
      secret,
    });

    await app.request(`/t/${token}.gif`, {
      headers: {
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "accept-language": "en-US,en;q=0.9",
        referer: "https://mail.example.com/",
        "cf-connecting-ip": "203.0.113.42",
        "cf-ipcountry": "US",
        "cf-ipcity": "San Francisco",
        "cf-region": "California",
        "cf-ipcontinent": "NA",
        "cf-timezone": "America/Los_Angeles",
      },
    });

    const pollResponse = await app.request(`/api/events/${token}`, {
      headers: { authorization: `Bearer ${apiKey}` },
    });
    const payload = await pollResponse.json();

    expect(pollResponse.status).toBe(200);
    expect(payload.found).toBe(true);
    expect(payload.data.userAgent).toContain("Windows");
    expect(payload.data.acceptLanguage).toBe("en-US,en;q=0.9");
    expect(payload.data.referer).toBe("https://mail.example.com/");
    expect(payload.data.ip).toBe("203.0.113.42");
    expect(payload.data.os).toBe("Windows");
    expect(payload.data.country).toBe("US");
    expect(payload.data.city).toBe("San Francisco");
    expect(payload.data.region).toBe("California");
    expect(payload.data.continent).toBe("NA");
    expect(payload.data.timezone).toBe("America/Los_Angeles");
  });

  it("enforces first write wins per runId and stepId", async () => {
    const { app, secret, apiKey } = makeApp();
    const token = encodeToken({
      runId: "run_dedupe",
      stepId: "welcome:open",
      secret,
    });
    const clickUrl = "https://example.com/will-not-overwrite";

    await app.request(`/t/${token}.gif`);
    await app.request(`/r/${token}?url=${encodeURIComponent(clickUrl)}`, {
      redirect: "manual",
    });

    const pollResponse = await app.request(`/api/events/${token}`, {
      headers: { authorization: `Bearer ${apiKey}` },
    });
    const payload = await pollResponse.json();

    expect(payload.found).toBe(true);
    expect(payload.data.event).toBe("open");
    expect(payload.data.url).toBeUndefined();
  });
});
