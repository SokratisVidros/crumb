import { EVENTS_SCHEMA_SQL, type EventRecord, type EventStore } from "../types";

type QueryResult<T> = {
  rows: T[];
};

type PostgresClientLike = {
  query: <T = Record<string, unknown>>(text: string, values?: unknown[]) => Promise<QueryResult<T>>;
};

type PostgresEventStoreOptions = {
  client: PostgresClientLike;
};

type PostgresRow = {
  run_id: string;
  step_id: string;
  event: "open" | "click";
  url: string | null;
  user_agent: string | null;
  ip: string | null;
  fired_at: string | Date;
};

export class PostgresEventStore implements EventStore {
  constructor(private readonly options: PostgresEventStoreOptions) {}

  async init(): Promise<void> {
    await this.options.client.query(EVENTS_SCHEMA_SQL);
  }

  async recordEvent(params: {
    runId: string;
    stepId: string;
    event: "open" | "click";
    url?: string;
    userAgent?: string;
    ip?: string;
  }): Promise<void> {
    await this.options.client.query(
      `INSERT INTO events (run_id, step_id, event, url, user_agent, ip)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (run_id, step_id) DO NOTHING`,
      [
        params.runId,
        params.stepId,
        params.event,
        params.url ?? null,
        params.userAgent ?? null,
        params.ip ?? null,
      ],
    );
  }

  async getEvent(params: { runId: string; stepId: string }): Promise<EventRecord | null> {
    const result = await this.options.client.query<PostgresRow>(
      `SELECT run_id, step_id, event, url, user_agent, ip, fired_at
       FROM events
       WHERE run_id = $1 AND step_id = $2`,
      [params.runId, params.stepId],
    );

    const row = result.rows[0];
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
