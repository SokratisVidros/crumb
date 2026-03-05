import type { EventRecord, EventStore, RecordEventParams } from "../types";

type KVNamespaceLike = {
  get: (key: string) => Promise<string | null>;
  put: (key: string, value: string) => Promise<void>;
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

  async recordEvent(params: RecordEventParams): Promise<void> {
    const key = this.keyFor(params.runId, params.stepId);
    const existing = await this.options.kv.get(key);
    if (existing) {
      return;
    }

    const value: SerializedEventRecord = {
      ...params,
      firedAt: new Date().toISOString(),
    };
    await this.options.kv.put(key, JSON.stringify(value));
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
}
