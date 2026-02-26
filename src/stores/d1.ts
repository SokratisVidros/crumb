import { EVENTS_SCHEMA_SQL, type EventRecord, type EventStore } from "../types";

type D1Statement = {
  bind: (...values: unknown[]) => D1Statement;
  run: () => Promise<unknown>;
  first: <T = Record<string, unknown>>() => Promise<T | null>;
};

type D1DatabaseLike = {
  prepare: (query: string) => D1Statement;
};

type D1EventStoreOptions = {
  db: D1DatabaseLike;
};

type D1Row = {
  run_id: string;
  step_id: string;
  event: "open" | "click";
  url: string | null;
  user_agent: string | null;
  ip: string | null;
  fired_at: string;
};

export class D1EventStore implements EventStore {
  constructor(private readonly options: D1EventStoreOptions) {}

  async init(): Promise<void> {
    await this.options.db.prepare(EVENTS_SCHEMA_SQL).run();
  }

  async recordEvent(params: {
    runId: string;
    stepId: string;
    event: "open" | "click";
    url?: string;
    userAgent?: string;
    ip?: string;
  }): Promise<void> {
    await this.options.db
      .prepare(
        `INSERT OR IGNORE INTO events (run_id, step_id, event, url, user_agent, ip)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        params.runId,
        params.stepId,
        params.event,
        params.url ?? null,
        params.userAgent ?? null,
        params.ip ?? null,
      )
      .run();
  }

  async getEvent(params: { runId: string; stepId: string }): Promise<EventRecord | null> {
    const row = await this.options.db
      .prepare(
        `SELECT run_id, step_id, event, url, user_agent, ip, fired_at
         FROM events
         WHERE run_id = ? AND step_id = ?`,
      )
      .bind(params.runId, params.stepId)
      .first<D1Row>();

    if (!row) {
      return null;
    }

    return {
      runId: row.run_id,
      stepId: row.step_id,
      event: row.event,
      url: row.url ?? undefined,
      userAgent: row.user_agent ?? undefined,
      ip: row.ip ?? undefined,
      firedAt: new Date(row.fired_at),
    };
  }
}
