import type { EventRecord, EventStore, RecordEventParams } from "../types";

/** Reversed timestamp so lexicographic order ascending = newest first. */
const REVERSED_TS_WIDTH = 16;
const TS_MAX = 9007199254740991; // Number.MAX_SAFE_INTEGER

function reversedTimestamp(ms: number): string {
  return String(TS_MAX - Math.max(0, ms)).padStart(REVERSED_TS_WIDTH, "0");
}

type KVNamespaceLike = {
  get: (key: string) => Promise<string | null>;
  put: (key: string, value: string) => Promise<void>;
  list: (options: { prefix?: string; limit?: number }) => Promise<{ keys: { name: string }[] }>;
};

type KVEventStoreOptions = {
  kv: KVNamespaceLike;
  keyPrefix?: string;
};

type SerializedEventRecord = RecordEventParams & { firedAt: string };

export class KVEventStore implements EventStore {
  private readonly keyPrefix: string;

  constructor(private readonly options: KVEventStoreOptions) {
    this.keyPrefix = options.keyPrefix ?? "email-tracker";
  }

  private keyFor(runId: string, stepId: string) {
    return `${this.keyPrefix}:${runId}:${stepId}`;
  }

  /** Lexicographically sortable by date (newest first). */
  private byDateKey(reversedTs: string, runId: string, stepId: string) {
    return `${this.keyPrefix}:by-date:${reversedTs}:${runId}:${stepId}`;
  }

  async recordEvent(params: RecordEventParams): Promise<void> {
    const key = this.keyFor(params.runId, params.stepId);
    const existing = await this.options.kv.get(key);
    if (existing) {
      return;
    }

    const now = Date.now();
    const value: SerializedEventRecord = {
      ...params,
      firedAt: new Date(now).toISOString(),
    };
    const valueStr = JSON.stringify(value);
    await this.options.kv.put(key, valueStr);
    await this.options.kv.put(
      this.byDateKey(reversedTimestamp(now), params.runId, params.stepId),
      valueStr,
    );
  }

  async getEvent(params: { runId: string; stepId: string }): Promise<EventRecord | null> {
    const key = this.keyFor(params.runId, params.stepId);
    const raw = await this.options.kv.get(key);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as SerializedEventRecord;
    return {
      ...parsed,
      firedAt: new Date(parsed.firedAt),
    };
  }

  async getLatestEvents(limit: number): Promise<EventRecord[]> {
    const { keys } = await this.options.kv.list({
      prefix: `${this.keyPrefix}:by-date:`,
      limit,
    });
    const out: EventRecord[] = [];
    for (const { name } of keys) {
      const raw = await this.options.kv.get(name);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as SerializedEventRecord;
      out.push({ ...parsed, firedAt: new Date(parsed.firedAt) });
    }
    return out;
  }
}
