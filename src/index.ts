import { MemoryEventStore } from "./stores";
import { createTracker } from "./tracker";

const trackerSecret = process.env.TRACKER_SECRET ?? "dev-tracker-secret";
const trackerApiKey = process.env.TRACKER_API_KEY ?? "dev-tracker-api-key";
const configuredPort = Number(process.env.PORT ?? 3000);
const port = Number.isInteger(configuredPort) && configuredPort > 0 ? configuredPort : 3000;

const app = createTracker({
  secret: trackerSecret,
  apiKey: trackerApiKey,
  store: new MemoryEventStore(),
});

export * from "./stores";
export * from "./token";
export * from "./tracker";
export * from "./types";

export default {
  port,
  fetch: app.fetch,
};
