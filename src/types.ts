export type EmailEventType = "open" | "click";

export type EventRecord = {
  runId: string;
  stepId: string;
  event: EmailEventType;
  url?: string;
  userAgent?: string;
  ip?: string;
  firedAt: Date;
};

export interface EventStore {
  recordEvent(params: {
    runId: string;
    stepId: string;
    event: EmailEventType;
    url?: string;
    userAgent?: string;
    ip?: string;
  }): Promise<void>;
  getEvent(params: { runId: string; stepId: string }): Promise<EventRecord | null>;
}

export const EVENTS_SCHEMA_SQL = `CREATE TABLE IF NOT EXISTS events (
  run_id TEXT NOT NULL,
  step_id TEXT NOT NULL,
  event TEXT NOT NULL,
  url TEXT,
  user_agent TEXT,
  ip TEXT,
  fired_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (run_id, step_id)
);`;
