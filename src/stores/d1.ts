import {
  applyTrackingFromRow,
  EVENT_COLUMNS,
  EVENTS_SCHEMA_SQL,
  type EventRecord,
  type EventStore,
  type RecordEventParams,
  trackingBindValues,
} from "../types";

export type D1Statement = {
  bind: (...values: unknown[]) => D1Statement;
  run: () => Promise<unknown>;
  first: <T = Record<string, unknown>>() => Promise<T | null>;
};

export type D1DatabaseLike = {
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
  fired_at: string;
} & Record<string, string | null>;

const PLACEHOLDERS = Array(19).fill("?").join(", ");

function rowToEventRecord(row: D1Row): EventRecord {
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

export class D1EventStore implements EventStore {
  constructor(private readonly options: D1EventStoreOptions) {}

  async init(): Promise<void> {
    await this.options.db.prepare(EVENTS_SCHEMA_SQL).run();
  }

  async recordEvent(params: RecordEventParams): Promise<void> {
    await this.options.db
      .prepare(`INSERT OR IGNORE INTO events (${EVENT_COLUMNS}) VALUES (${PLACEHOLDERS})`)
      .bind(
        params.runId,
        params.stepId,
        params.event,
        params.url ?? null,
        ...trackingBindValues(params),
      )
      .run();
  }

  async getEvent(params: { runId: string; stepId: string }): Promise<EventRecord | null> {
    const row = await this.options.db
      .prepare(`SELECT ${EVENT_COLUMNS}, fired_at FROM events WHERE run_id = ? AND step_id = ?`)
      .bind(params.runId, params.stepId)
      .first<D1Row>();

    if (!row) {
      return null;
    }
    return rowToEventRecord(row);
  }
}
