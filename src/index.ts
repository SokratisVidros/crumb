import { KVEventStore, MemoryEventStore } from "./stores";
import { createTracker } from "./tracker";
import type { EventStore } from "./types";

const configuredPort = Number(process.env["PORT"] ?? 3000);
const port = Number.isInteger(configuredPort) && configuredPort > 0 ? configuredPort : 3000;

/** In-memory store for local dev (single process). On Workers, use KV so all isolates share state. */
const memoryStore = new MemoryEventStore();

/** KV namespace–like binding (e.g. Cloudflare Workers env.EVENTS_KV). */
type KVBinding = {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  list(options: { prefix?: string; limit?: number }): Promise<{ keys: { name: string }[] }>;
};

type WorkerEnv = {
  TRACKER_SECRET?: string;
  TRACKER_API_KEY?: string;
  /** Cloudflare KV namespace for event storage. When set, used so all Worker isolates see the same events. */
  EVENTS_KV?: KVBinding;
};

function getStore(env?: WorkerEnv): EventStore {
  const kv = env?.EVENTS_KV;
  if (kv) {
    console.log("[humantrail] store: KVEventStore (shared across isolates)");
    return new KVEventStore({ kv });
  }
  console.log("[humantrail] store: MemoryEventStore (local only)");
  return memoryStore;
}

function getApp(env?: WorkerEnv) {
  const secret = env?.TRACKER_SECRET ?? process.env["TRACKER_SECRET"] ?? "dev-tracker-secret";
  const apiKey = env?.TRACKER_API_KEY ?? process.env["TRACKER_API_KEY"] ?? "dev-tracker-api-key";
  const store = getStore(env);
  return createTracker({ secret, apiKey, store });
}

export * from "./stores";
export * from "./token";
export * from "./tracker";
export * from "./types";

export default {
  port,
  fetch(request: Request, env?: WorkerEnv): Response | Promise<Response> {
    return getApp(env).fetch(request);
  },
};
