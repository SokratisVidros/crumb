import { describe, expect, it } from "bun:test";
import type { EventRecord, RecordEventParams } from "../types";
import { TRACKING_FIELDS } from "../types";
import { type D1DatabaseLike, D1EventStore, type D1Statement } from "./d1";
import { KVEventStore } from "./kv";
import { MemoryEventStore } from "./memory";
import { PostgresEventStore } from "./postgres";
import { SqliteEventStore } from "./sqlite";

function minimalParams(overrides: Partial<RecordEventParams> = {}): RecordEventParams {
  return {
    runId: "run-1",
    stepId: "step-1",
    event: "open",
    ...overrides,
  };
}

function assertEventShape(record: EventRecord, params: RecordEventParams): void {
  expect(record.runId).toBe(params.runId);
  expect(record.stepId).toBe(params.stepId);
  expect(record.event).toBe(params.event);
  expect(record.firedAt).toBeInstanceOf(Date);
  if (params.url !== undefined) {
    expect(record.url).toBe(params.url);
  }
  for (const { param } of TRACKING_FIELDS) {
    const expected = (params as Record<string, unknown>)[param];
    if (expected !== undefined) {
      expect((record as Record<string, unknown>)[param]).toBe(expected);
    }
  }
}

describe("MemoryEventStore", () => {
  it("returns null when no event is recorded", async () => {
    const store = new MemoryEventStore();
    const got = await store.getEvent({ runId: "r", stepId: "s" });
    expect(got).toBeNull();
  });

  it("records and returns an open event", async () => {
    const store = new MemoryEventStore();
    const params = minimalParams({ event: "open" });
    await store.recordEvent(params);
    const got = await store.getEvent({ runId: params.runId, stepId: params.stepId });
    expect(got).not.toBeNull();
    assertEventShape(got as EventRecord, params);
    expect((got as EventRecord).event).toBe("open");
  });

  it("records and returns a click event with url", async () => {
    const store = new MemoryEventStore();
    const params = minimalParams({
      event: "click",
      url: "https://example.com/landing",
    });
    await store.recordEvent(params);
    const got = await store.getEvent({ runId: params.runId, stepId: params.stepId });
    expect(got).not.toBeNull();
    expect((got as EventRecord).url).toBe("https://example.com/landing");
    expect((got as EventRecord).event).toBe("click");
  });

  it("preserves tracking context", async () => {
    const store = new MemoryEventStore();
    const params = minimalParams({
      userAgent: "Mozilla/5.0",
      ip: "192.168.1.1",
      country: "US",
      city: "San Francisco",
    });
    await store.recordEvent(params);
    const got = await store.getEvent({ runId: params.runId, stepId: params.stepId });
    expect(got).not.toBeNull();
    expect((got as EventRecord).userAgent).toBe("Mozilla/5.0");
    expect((got as EventRecord).ip).toBe("192.168.1.1");
    expect((got as EventRecord).country).toBe("US");
    expect((got as EventRecord).city).toBe("San Francisco");
  });

  it("is idempotent: second record does not overwrite", async () => {
    const store = new MemoryEventStore();
    await store.recordEvent(minimalParams({ event: "open" }));
    await store.recordEvent(minimalParams({ event: "click", url: "https://example.com/other" }));
    const got = await store.getEvent({ runId: "run-1", stepId: "step-1" });
    expect(got).not.toBeNull();
    expect((got as EventRecord).event).toBe("open");
    expect((got as EventRecord).url).toBeUndefined();
  });

  it("allows different runId/stepId to coexist", async () => {
    const store = new MemoryEventStore();
    await store.recordEvent(minimalParams({ runId: "r1", stepId: "s1", event: "open" }));
    await store.recordEvent(minimalParams({ runId: "r2", stepId: "s2", event: "click" }));
    const a = await store.getEvent({ runId: "r1", stepId: "s1" });
    const b = await store.getEvent({ runId: "r2", stepId: "s2" });
    expect(a?.event).toBe("open");
    expect(b?.event).toBe("click");
  });
});

describe("KVEventStore", () => {
  function createFakeKV(): {
    kv: {
      get: (key: string) => Promise<string | null>;
      put: (key: string, value: string) => Promise<void>;
    };
    data: Map<string, string>;
  } {
    const data = new Map<string, string>();
    return {
      data,
      kv: {
        get: async (key: string) => data.get(key) ?? null,
        put: async (key: string, value: string) => {
          data.set(key, value);
        },
      },
    };
  }

  it("returns null when no event is recorded", async () => {
    const { kv } = createFakeKV();
    const store = new KVEventStore({ kv });
    const got = await store.getEvent({ runId: "r", stepId: "s" });
    expect(got).toBeNull();
  });

  it("records and returns an event", async () => {
    const { kv } = createFakeKV();
    const store = new KVEventStore({ kv });
    const params = minimalParams({ event: "open" });
    await store.recordEvent(params);
    const got = await store.getEvent({ runId: params.runId, stepId: params.stepId });
    expect(got).not.toBeNull();
    assertEventShape(got as EventRecord, params);
  });

  it("uses custom key prefix when provided", async () => {
    const { kv, data } = createFakeKV();
    const store = new KVEventStore({ kv, keyPrefix: "custom-prefix" });
    await store.recordEvent(minimalParams());
    const key = Array.from(data.keys())[0];
    expect(key).toMatch(/^custom-prefix:/);
  });

  it("is idempotent: second record does not overwrite", async () => {
    const { kv } = createFakeKV();
    const store = new KVEventStore({ kv });
    await store.recordEvent(minimalParams({ event: "open" }));
    await store.recordEvent(minimalParams({ event: "click", url: "https://example.com/other" }));
    const got = await store.getEvent({ runId: "run-1", stepId: "step-1" });
    expect(got?.event).toBe("open");
  });

  it("round-trips firedAt as Date", async () => {
    const { kv } = createFakeKV();
    const store = new KVEventStore({ kv });
    await store.recordEvent(minimalParams());
    const got = await store.getEvent({ runId: "run-1", stepId: "step-1" });
    expect(got?.firedAt).toBeInstanceOf(Date);
  });
});

describe("D1EventStore", () => {
  function createFakeD1(): { db: D1DatabaseLike; rows: Map<string, Record<string, unknown>> } {
    const rows = new Map<string, Record<string, unknown>>();
    const runIdIdx = 0;
    const stepIdIdx = 1;
    const eventIdx = 2;
    const urlIdx = 3;
    const trackingStart = 4;
    const trackingKeys = TRACKING_FIELDS.map((f) => f.db);

    const makeStmt = (bound: unknown[]): D1Statement => ({
      bind(...values: unknown[]) {
        bound.length = 0;
        bound.push(...values);
        return makeStmt(bound);
      },
      run: async () => {
        if (bound.length >= 4) {
          const key = `${bound[runIdIdx]}:${bound[stepIdIdx]}`;
          if (rows.has(key)) return;
          const row: Record<string, unknown> = {
            run_id: bound[runIdIdx],
            step_id: bound[stepIdIdx],
            event: bound[eventIdx],
            url: bound[urlIdx],
            fired_at: new Date().toISOString(),
          };
          for (let i = 0; i < trackingKeys.length; i++) {
            row[trackingKeys[i] as string] = bound[trackingStart + i] ?? null;
          }
          rows.set(key, row);
        }
      },
      first: async <T = Record<string, unknown>>() => {
        if (bound.length >= 2 && bound[0] != null && bound[1] != null) {
          const key = `${bound[runIdIdx]}:${bound[stepIdIdx]}`;
          const row = (rows.get(key) as Record<string, unknown> | undefined) ?? null;
          return row as T | null;
        }
        return null;
      },
    });

    return {
      rows,
      db: {
        prepare(_sql: string) {
          const bound: unknown[] = [];
          return makeStmt(bound);
        },
      },
    };
  }

  it("returns null when no event is recorded", async () => {
    const { db } = createFakeD1();
    const store = new D1EventStore({ db });
    await store.init();
    const got = await store.getEvent({ runId: "r", stepId: "s" });
    expect(got).toBeNull();
  });

  it("records and returns an event", async () => {
    const { db } = createFakeD1();
    const store = new D1EventStore({ db });
    await store.init();
    const params = minimalParams({ event: "open" });
    await store.recordEvent(params);
    const got = await store.getEvent({ runId: params.runId, stepId: params.stepId });
    expect(got).not.toBeNull();
    assertEventShape(got as EventRecord, params);
  });

  it("is idempotent: second record does not overwrite", async () => {
    const { db } = createFakeD1();
    const store = new D1EventStore({ db });
    await store.init();
    await store.recordEvent(minimalParams({ event: "open" }));
    await store.recordEvent(minimalParams({ event: "click", url: "https://example.com/other" }));
    const got = await store.getEvent({ runId: "run-1", stepId: "step-1" });
    expect(got?.event).toBe("open");
  });
});

describe("PostgresEventStore", () => {
  function createFakePostgres(): {
    client: {
      query: <T = Record<string, unknown>>(
        text: string,
        values?: unknown[],
      ) => Promise<{ rows: T[] }>;
    };
    rows: Map<string, Record<string, unknown>>;
  } {
    const rows = new Map<string, Record<string, unknown>>();
    const trackingKeys = TRACKING_FIELDS.map((f) => f.db);

    return {
      rows,
      client: {
        query: async <T = Record<string, unknown>>(
          text: string,
          values?: unknown[],
        ): Promise<{ rows: T[] }> => {
          if (text.includes("CREATE TABLE")) {
            return { rows: [] as T[] };
          }
          if (text.includes("INSERT")) {
            const runId = values?.[0];
            const stepId = values?.[1];
            const key = `${runId}:${stepId}`;
            if (rows.has(key)) return { rows: [] as T[] };
            const row: Record<string, unknown> = {
              run_id: values?.[0],
              step_id: values?.[1],
              event: values?.[2],
              url: values?.[3],
              fired_at: new Date().toISOString(),
            };
            for (let i = 0; i < trackingKeys.length; i++) {
              row[trackingKeys[i] as string] = values?.[4 + i] ?? null;
            }
            rows.set(key, row);
            return { rows: [] as T[] };
          }
          if (text.includes("SELECT")) {
            const runId = values?.[0];
            const stepId = values?.[1];
            const key = `${runId}:${stepId}`;
            const row = rows.get(key);
            return { rows: (row ? [row] : []) as T[] };
          }
          return { rows: [] as T[] };
        },
      },
    };
  }

  it("returns null when no event is recorded", async () => {
    const { client } = createFakePostgres();
    const store = new PostgresEventStore({ client });
    await store.init();
    const got = await store.getEvent({ runId: "r", stepId: "s" });
    expect(got).toBeNull();
  });

  it("records and returns an event", async () => {
    const { client } = createFakePostgres();
    const store = new PostgresEventStore({ client });
    await store.init();
    const params = minimalParams({ event: "open" });
    await store.recordEvent(params);
    const got = await store.getEvent({ runId: params.runId, stepId: params.stepId });
    expect(got).not.toBeNull();
    assertEventShape(got as EventRecord, params);
  });

  it("is idempotent: ON CONFLICT DO NOTHING", async () => {
    const { client } = createFakePostgres();
    const store = new PostgresEventStore({ client });
    await store.init();
    await store.recordEvent(minimalParams({ event: "open" }));
    await store.recordEvent(minimalParams({ event: "click", url: "https://example.com/other" }));
    const got = await store.getEvent({ runId: "run-1", stepId: "step-1" });
    expect(got?.event).toBe("open");
  });
});

describe("SqliteEventStore", () => {
  function createFakeSqlite(): {
    db: {
      query: (sql: string) => {
        run: (...params: unknown[]) => void;
        get: (...params: unknown[]) => Record<string, unknown> | null;
      };
    };
    rows: Map<string, Record<string, unknown>>;
  } {
    const rows = new Map<string, Record<string, unknown>>();
    const trackingKeys = TRACKING_FIELDS.map((f) => f.db);

    return {
      rows,
      db: {
        query(sql: string) {
          return {
            run: (...params: unknown[]) => {
              if (sql.includes("INSERT")) {
                const runId = params[0];
                const stepId = params[1];
                const key = `${runId}:${stepId}`;
                if (rows.has(key)) return;
                const row: Record<string, unknown> = {
                  run_id: params[0],
                  step_id: params[1],
                  event: params[2],
                  url: params[3],
                  fired_at: new Date().toISOString(),
                };
                for (let i = 0; i < trackingKeys.length; i++) {
                  row[trackingKeys[i] as string] = params[4 + i] ?? null;
                }
                rows.set(key, row);
              }
            },
            get: (...params: unknown[]) => {
              if (sql.includes("SELECT")) {
                const key = `${params[0]}:${params[1]}`;
                return (rows.get(key) as Record<string, unknown>) ?? null;
              }
              return null;
            },
          };
        },
      },
    };
  }

  it("returns null when no event is recorded", async () => {
    const { db } = createFakeSqlite();
    const store = new SqliteEventStore({ db });
    store.init();
    const got = await store.getEvent({ runId: "r", stepId: "s" });
    expect(got).toBeNull();
  });

  it("records and returns an event", async () => {
    const { db } = createFakeSqlite();
    const store = new SqliteEventStore({ db });
    store.init();
    const params = minimalParams({ event: "open" });
    await store.recordEvent(params);
    const got = await store.getEvent({ runId: params.runId, stepId: params.stepId });
    expect(got).not.toBeNull();
    assertEventShape(got as EventRecord, params);
  });

  it("is idempotent: INSERT OR IGNORE", async () => {
    const { db } = createFakeSqlite();
    const store = new SqliteEventStore({ db });
    store.init();
    await store.recordEvent(minimalParams({ event: "open" }));
    await store.recordEvent(minimalParams({ event: "click", url: "https://example.com/other" }));
    const got = await store.getEvent({ runId: "run-1", stepId: "step-1" });
    expect(got?.event).toBe("open");
  });
});
