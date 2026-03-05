import {
  applyTrackingFromRow,
  EVENT_COLUMNS,
  EVENTS_SCHEMA_SQL,
  type EventRecord,
  type EventStore,
  type RecordEventParams,
  trackingBindValues,
} from "../types";

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
  fired_at: string | Date;
} & Record<string, string | null>;

const PLACEHOLDER_LIST = Array.from({ length: 19 }, (_, i) => `$${i + 1}`).join(", ");

function rowToEventRecord(row: PostgresRow): EventRecord {
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

export class PostgresEventStore implements EventStore {
  constructor(private readonly options: PostgresEventStoreOptions) {}

  async init(): Promise<void> {
    await this.options.client.query(EVENTS_SCHEMA_SQL);
  }

  async recordEvent(params: RecordEventParams): Promise<void> {
    await this.options.client.query(
      `INSERT INTO events (${EVENT_COLUMNS}) VALUES (${PLACEHOLDER_LIST})
       ON CONFLICT (run_id, step_id) DO NOTHING`,
      [
        params.runId,
        params.stepId,
        params.event,
        params.url ?? null,
        ...trackingBindValues(params),
      ],
    );
  }

  async getEvent(params: { runId: string; stepId: string }): Promise<EventRecord | null> {
    const result = await this.options.client.query<PostgresRow>(
      `SELECT ${EVENT_COLUMNS}, fired_at FROM events WHERE run_id = $1 AND step_id = $2`,
      [params.runId, params.stepId],
    );

    const row = result.rows[0];
    if (!row) {
      return null;
    }
    return rowToEventRecord(row);
  }
}
