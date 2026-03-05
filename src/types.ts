export type EmailEventType = "open" | "click";

/** Location and device context extracted from request (Cloudflare headers + UA). */
export type TrackingContext = {
  userAgent?: string;
  ip?: string;
  acceptLanguage?: string;
  referer?: string;
  os?: string;
  deviceType?: string;
  country?: string;
  city?: string;
  region?: string;
  regionCode?: string;
  continent?: string;
  latitude?: string;
  longitude?: string;
  postalCode?: string;
  timezone?: string;
};

/** Single source of truth: DB column name → JS param key for all tracking fields. */
export const TRACKING_FIELDS = [
  { db: "user_agent", param: "userAgent" },
  { db: "ip", param: "ip" },
  { db: "accept_language", param: "acceptLanguage" },
  { db: "referer", param: "referer" },
  { db: "os", param: "os" },
  { db: "device_type", param: "deviceType" },
  { db: "country", param: "country" },
  { db: "city", param: "city" },
  { db: "region", param: "region" },
  { db: "region_code", param: "regionCode" },
  { db: "continent", param: "continent" },
  { db: "latitude", param: "latitude" },
  { db: "longitude", param: "longitude" },
  { db: "postal_code", param: "postalCode" },
  { db: "timezone", param: "timezone" },
] as const;

export const TRACKING_COLUMNS = TRACKING_FIELDS.map((f) => f.db).join(", ");
export const EVENT_COLUMNS = `run_id, step_id, event, url, ${TRACKING_COLUMNS}`;

/** Merge only defined tracking fields from context into params (exactOptionalPropertyTypes-safe). */
export function mergeTrackingParams(
  base: { runId: string; stepId: string; event: EmailEventType },
  ctx: TrackingContext,
  url?: string,
): RecordEventParams {
  const out: Record<string, unknown> = { ...base };
  if (url !== undefined) {
    // biome-ignore lint/complexity/useLiteralKeys: bracket required for Record<string, unknown>
    out["url"] = url;
  }
  for (const { param } of TRACKING_FIELDS) {
    const v = (ctx as Record<string, unknown>)[param];
    if (v !== undefined) out[param] = v;
  }
  return out as RecordEventParams;
}

/** Bind values for tracking columns in TRACKING_FIELDS order (for INSERT). */
export function trackingBindValues(params: RecordEventParams): unknown[] {
  return TRACKING_FIELDS.map((f) => (params as Record<string, unknown>)[f.param] ?? null);
}

/** Apply tracking columns from a DB row onto an EventRecord (mutates event). */
export function applyTrackingFromRow(event: EventRecord, row: Record<string, string | null>): void {
  for (const { db, param } of TRACKING_FIELDS) {
    const v = row[db];
    if (v != null) (event as unknown as Record<string, string>)[param] = v;
  }
}

export type EventRecord = {
  runId: string;
  stepId: string;
  event: EmailEventType;
  url?: string;
  firedAt: Date;
} & TrackingContext;

export type RecordEventParams = {
  runId: string;
  stepId: string;
  event: EmailEventType;
  url?: string;
} & TrackingContext;

export interface EventStore {
  recordEvent(params: RecordEventParams): Promise<void>;
  getEvent(params: { runId: string; stepId: string }): Promise<EventRecord | null>;
  getLatestEvents?(limit: number): Promise<EventRecord[]>;
}

export const EVENTS_SCHEMA_SQL = `CREATE TABLE IF NOT EXISTS events (
  run_id TEXT NOT NULL,
  step_id TEXT NOT NULL,
  event TEXT NOT NULL,
  url TEXT,
  user_agent TEXT,
  ip TEXT,
  accept_language TEXT,
  referer TEXT,
  os TEXT,
  device_type TEXT,
  country TEXT,
  city TEXT,
  region TEXT,
  region_code TEXT,
  continent TEXT,
  latitude TEXT,
  longitude TEXT,
  postal_code TEXT,
  timezone TEXT,
  fired_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (run_id, step_id)
);`;
