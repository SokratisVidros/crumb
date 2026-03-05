import {
  applyTrackingFromRow,
  EVENT_COLUMNS,
  EVENTS_SCHEMA_SQL,
  type EventRecord,
  type EventStore,
  type RecordEventParams,
  trackingBindValues,
} from "../types";

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
  fired_at: string;
} & Record<string, string | null>;

const PLACEHOLDERS = Array(19).fill("?").join(", ");

function rowToEventRecord(row: SqliteRow): EventRecord {
  const event: EventRecord = {
    runId: row.run_id,
    stepId: row.step_id,
    event: row.event,
    firedAt: new Date(row.fired_at),
  };
  if (row.url != null) event.url = row.url;
  applyTrackingFromRow(event, row);
  return event;
}

export class SqliteEventStore implements EventStore {
  constructor(private readonly options: SqliteEventStoreOptions) {}

  init(): void {
    this.options.db.query(EVENTS_SCHEMA_SQL).run();
  }

  async recordEvent(params: RecordEventParams): Promise<void> {
    this.options.db
      .query(`INSERT OR IGNORE INTO events (${EVENT_COLUMNS}) VALUES (${PLACEHOLDERS})`)
      .run(
        params.runId,
        params.stepId,
        params.event,
        params.url ?? null,
        ...trackingBindValues(params),
      );
  }

  async getEvent(params: { runId: string; stepId: string }): Promise<EventRecord | null> {
    const row = this.options.db
      .query(`SELECT ${EVENT_COLUMNS}, fired_at FROM events WHERE run_id = ? AND step_id = ?`)
      .get(params.runId, params.stepId) as SqliteRow | null;

    if (!row) {
      return null;
    }
    return rowToEventRecord(row);
  }
}
