# humantrail

`humantrail` is a lightweight email-interaction tracker service.

It records two events tied to a signed token:
- `open`: when an email pixel is requested
- `click`: when a tracked redirect link is followed

The service is designed to be easy to embed in larger systems (campaign engines, outreach tools, workflow apps) while keeping the tracking surface small, explicit, and portable across storage backends.

## Purpose

Email clients and links can only provide limited context. `humantrail` adds a simple server-side tracking layer that:
- verifies a signed token for each tracked resource
- records at most one event per `(runId, stepId)` pair (idempotent write)
- optionally returns the stored event through an API endpoint

This lets upstream systems answer questions like:
- "Did recipient step `welcome:open` happen for run `run_123`?"
- "Was a tracked CTA link clicked?"

## Architecture

At runtime, the project is composed of 4 core parts:

1. **HTTP app (`src/tracker.ts`)**
   - Built with Hono.
   - Exposes the tracking and read endpoints.
   - Extracts metadata (IP, user-agent) from request headers.

2. **Token module (`src/token.ts`)**
   - Creates and verifies HS256 JWT tokens carrying `runId` and `stepId`.
   - Rejects tampered, malformed, or mismatched-signature tokens.

3. **Store interface (`src/types.ts`)**
   - `EventStore` defines `recordEvent()` and `getEvent()`.
   - Keeps HTTP logic decoupled from persistence.

4. **Store implementations (`src/stores/*`)**
   - `MemoryEventStore` (local/dev)
   - `KVEventStore` (Cloudflare KV style)
   - `D1EventStore`, `SqliteEventStore`, `PostgresEventStore`

`src/index.ts` wires these pieces together and exports a default fetch handler.

## Request Flow

### 1) Open tracking pixel
- Endpoint: `GET /t/<token>.gif` (or `GET /t/<token>`)
- Behavior:
  - verifies token
  - records `open` event when valid
  - always returns a 1x1 transparent GIF with no-cache headers

### 2) Click tracking redirect
- Endpoint: `GET /r/:token?url=<encoded-target-url>`
- Behavior:
  - verifies token + validates target URL presence
  - records `click` event when valid
  - responds with `302` redirect to `url`

### 3) Event lookup API
- Endpoint: `GET /api/events/:token`
- Auth: `Authorization: Bearer <TRACKER_API_KEY>` (also supports `x-api-key` and `x-tracker-api-key`)
- Behavior:
  - verifies API key
  - verifies token
  - returns `{ found: false }` or `{ found: true, data: ... }`

## Configuration

Environment variables used by `src/index.ts`:
- `TRACKER_SECRET`: signing/verification secret for tracking tokens
- `TRACKER_API_KEY`: API key for `/api/events/:token`
- `PORT`: local server port (default `3000`)

If omitted in development, safe default dev values are used.

## Local Development

Install dependencies:
```sh
bun install
```

Run in dev mode:
```sh
bun run dev
```

Run tests:
```sh
bun test
```

Lint:
```sh
bun run lint
```

Format:
```sh
bun run format
```

Run lint + format checks (CI-friendly):
```sh
bun run check
```

Use a custom port:
```sh
PORT=8080 bun run dev
```

Open `http://localhost:<PORT>` (defaults to `3000`).

## Deployment Notes

- `wrangler.toml` is configured for a Cloudflare Worker entrypoint (`main = "src/index.ts"`).
- For production, replace `MemoryEventStore` with a durable store (for example `D1EventStore`, `KVEventStore`, or `PostgresEventStore`) when wiring `createTracker()`.
