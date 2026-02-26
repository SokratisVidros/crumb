import { EVENTS_SCHEMA_SQL, type EventRecord, type EventStore } from "../types";

type SqliteQueryLike = {
  run: (...params: unknown[]) => unknown;
  get: (...params: unknown[]) => Record<string, unknown> | null;
};

type SqliteDatabaseLike = {
  query: (query: string) => SqliteQueryLike;
};

type SqliteEventStoreOptions = {
  db: SqliteDatabaseLike;
};

type SqliteRow = {
  run_id: string;
  step_id: string;
  event: "open" | "click";
  url: string | null;
  user_agent: string | null;
  ip: string | null;
  fired_at: string;
};

export class SqliteEventStore implements EventStore {
  constructor(private readonly options: SqliteEventStoreOptions) {}

  init(): void {
    this.options.db.query(EVENTS_SCHEMA_SQL).run();
  }

  async recordEvent(params: {
    runId: string;
    stepId: string;
    event: "open" | "click";
    url?: string;
    userAgent?: string;
    ip?: string;
  }): Promise<void> {
    this.options.db
      .query(
        `INSERT OR IGNORE INTO events (run_id, step_id, event, url, user_agent, ip)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        params.runId,
        params.stepId,
        params.event,
        params.url ?? null,
        params.userAgent ?? null,
        params.ip ?? null,
      );
  }

  async getEvent(params: { runId: string; stepId: string }): Promise<EventRecord | null> {
    const row = this.options.db
      .query(
        `SELECT run_id, step_id, event, url, user_agent, ip, fired_at
         FROM events
         WHERE run_id = ? AND step_id = ?`,
      )
      .get(params.runId, params.stepId) as SqliteRow | null;

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
