# API Reference

This document describes all HTTP endpoints exposed by the crumb tracking service: their purpose, inputs, and outputs.

**Base URL:** The service runs on the configured `PORT` (default `3000`). All paths below are relative to the root (e.g. `http://localhost:3000/`).

---

## Overview

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/` | Health check |
| `GET` | `/t/*` | Open-tracking pixel |
| `GET` | `/r/:token` | Click-tracking redirect |
| `GET` | `/api/events/:token` | Fetch stored event (API) |
| `GET` | `/dev/events` | Dev only: latest 10 events (ASCII table) |

---

## Authentication

- **Pixel (`/t/*`)** and **redirect (`/r/:token`)** do **not** require authentication. They use a signed token in the URL.
- **Event lookup (`/api/events/:token`)** requires an API key via one of:
  - `Authorization: Bearer <TRACKER_API_KEY>`
  - `x-api-key: <TRACKER_API_KEY>`
  - `x-tracker-api-key: <TRACKER_API_KEY>`

---

## Token format

Tracking tokens are **opaque signed strings** (not JWTs). Format: `base64url(runId:stepId)-first12hex(hmac-sha256)` where the HMAC is computed with `TRACKER_SECRET` over the payload `runId:stepId`.

- **runId:** Identifies the “run” (e.g. a campaign or workflow run).
- **stepId:** Identifies the step within that run (e.g. a specific email or CTA).

Tokens are created with `encodeToken({ runId, stepId, secret })` from `src/token.ts`. Invalid or tampered tokens are rejected; no event is recorded and (where applicable) an error response is returned.

---

## 1. Health check

**`GET /`**

Used to verify the service is up. No authentication.

### Input

- **Path:** `/`
- **Query:** none
- **Headers:** none required
- **Body:** none

### Output

**Success (200 OK)**

| Content-Type | Body |
|-------------|------|
| `application/json` | `{ "ok": true, "crumb": "🍞" }` |

**Example**

```bash
curl -s "http://localhost:3000/"
# {"ok":true,"crumb":"🍞"}
```

---

## 2. Open-tracking pixel

**`GET /t/<token>` or `GET /t/<token>.gif`**

Embeds a 1×1 transparent GIF in emails. When the image is loaded, the service verifies the token and records an **open** event for that `(runId, stepId)`, then always returns the same GIF (with no-cache headers). No authentication.

### Input

- **Path:**
  - `/t/<token>` — token is the path segment after `/t/`
  - `/t/<token>.gif` — token is the path segment after `/t/` with `.gif` stripped
- **Query:** none used; any query string is ignored for parsing.
- **Headers:** Optional; if present, the following are used to enrich the stored event (see **Tracking context** below):
  - `user-agent`, `accept-language`, `referer` / `referrer`
  - Cloudflare: `cf-connecting-ip`, `x-forwarded-for`, `cf-ipcountry`, `cf-ipcity`, `cf-region`, `cf-region-code`, `cf-ipcontinent`, `cf-iplatitude`, `cf-iplongitude`, `cf-postal-code`, `cf-timezone`
- **Body:** none

If the path has no token (e.g. `GET /t/` or `GET /t`), the server still returns the GIF but does **not** record an event.

### Output

**Success (200 OK)** — always returned when the path is valid (with or without a valid token).

| Header | Value |
|--------|--------|
| `Content-Type` | `image/gif` |
| `Content-Length` | length of the GIF in bytes |
| `Cache-Control` | `no-store, no-cache, must-revalidate, max-age=0` |
| `Pragma` | `no-cache` |
| `Expires` | `0` |

**Body:** Binary 1×1 transparent GIF (same for every request).

- If the token is **valid:** an **open** event is recorded for `(runId, stepId)` and the GIF is returned.
- If the token is **missing or invalid:** no event is recorded; the GIF is still returned (behavior is identical for clients).

**Example**

```bash
curl -i "http://localhost:3000/t/eyJhbGciOiJIUzI1NiJ9....gif"
# HTTP/1.1 200 OK
# Content-Type: image/gif
# ...
# <binary GIF>
```

---

## 3. Click-tracking redirect

**`GET /r/:token?url=<target_url>`**

Used for tracked links in emails. Verifies the token and requires a `url` query parameter. Records a **click** event (including the destination URL) and redirects the user to that URL.

### Input

- **Path:** `/r/:token` — `token` is the path parameter (the JWT).
- **Query:**
  - **`url`** (required when token is valid): URL-encoded destination. The user is redirected here with a 302. Must be present and non-empty for a valid token; otherwise the response is 400.
- **Headers:** Same optional tracking headers as the pixel (see **Tracking context**).
- **Body:** none

### Output

**Success (302 Found)**

- **Location:** The value of the `url` query parameter (decoded).
- **Body:** Empty or minimal; client should follow redirect.

An event is recorded with `event: "click"` and the destination URL stored.

**Error (400 Bad Request)**

| Content-Type | Body |
|-------------|------|
| `application/json` | `{ "error": "invalid_tracking_link" }` |

Returned when:
- Path parameter `token` is missing, or
- Token fails verification, or
- `url` query is missing or empty (for a valid token).

**Example**

```bash
# Follow redirect
curl -L -i "http://localhost:3000/r/eyJhbGciOiJIUzI1NiJ9...?url=https%3A%2F%2Fexample.com%2Fpricing"

# Inspect redirect only
curl -i "http://localhost:3000/r/eyJhbGciOiJIUzI1NiJ9...?url=https%3A%2F%2Fexample.com%2Fpricing"
# HTTP/1.1 302 Found
# Location: https://example.com/pricing
```

---

## 4. Event lookup API

**`GET /api/events/:token`**

Returns the stored event for the given tracking token (same `(runId, stepId)` as in the JWT). Requires API key authentication.

### Input

- **Path:** `/api/events/:token` — `token` is the JWT used for the pixel or redirect.
- **Query:** none
- **Headers:** One of:
  - `Authorization: Bearer <TRACKER_API_KEY>`
  - `x-api-key: <TRACKER_API_KEY>`
  - `x-tracker-api-key: <TRACKER_API_KEY>`
- **Body:** none

### Output

**Success — event found (200 OK)**

| Content-Type | Body |
|-------------|------|
| `application/json` | `{ "found": true, "data": <EventRecord> }` |

**Success — event not found (200 OK)**

| Content-Type | Body |
|-------------|------|
| `application/json` | `{ "found": false }` |

No event was ever recorded for this token (e.g. pixel/click never fired or store has no row for that `(runId, stepId)`).

**Error — unauthorized (401 Unauthorized)**

| Content-Type | Body |
|-------------|------|
| `application/json` | `{ "error": "unauthorized" }` |

Returned when the API key is missing or does not match `TRACKER_API_KEY`.

**Error — bad request (400 Bad Request)**

| Content-Type | Body |
|-------------|------|
| `application/json` | `{ "error": "invalid_token" }` |

Returned when the path parameter `token` is missing or the JWT fails verification.

### Event record shape (`data` when `found: true`)

`data` is an **EventRecord** with the following fields. All fields except `runId`, `stepId`, `event`, and `firedAt` are optional and may be omitted if not captured.

| Field | Type | Description |
|-------|------|-------------|
| `runId` | string | From token |
| `stepId` | string | From token |
| `event` | `"open"` \| `"click"` | Event type |
| `firedAt` | string (ISO 8601) | When the event was recorded (e.g. `"2025-03-04T12:00:00.000Z"`) |
| `url` | string | Present for `click` events; destination URL. Omitted for `open` |
| `userAgent` | string | From `User-Agent` header |
| `ip` | string | From `cf-connecting-ip` or `x-forwarded-for` |
| `acceptLanguage` | string | From `Accept-Language` |
| `referer` | string | From `Referer` / `Referrer` |
| `os` | string | Parsed from User-Agent (e.g. "Windows", "iOS") |
| `deviceType` | string | Parsed from User-Agent (e.g. "mobile", "tablet") |
| `country` | string | From Cloudflare `cf-ipcountry` |
| `city` | string | From Cloudflare `cf-ipcity` |
| `region` | string | From Cloudflare `cf-region` |
| `regionCode` | string | From Cloudflare `cf-region-code` |
| `continent` | string | From Cloudflare `cf-ipcontinent` |
| `latitude` | string | From Cloudflare `cf-iplatitude` |
| `longitude` | string | From Cloudflare `cf-iplongitude` |
| `postalCode` | string | From Cloudflare `cf-postal-code` |
| `timezone` | string | From Cloudflare `cf-timezone` |

**Example — found**

```bash
curl -s -H "Authorization: Bearer dev-tracker-api-key" \
  "http://localhost:3000/api/events/eyJhbGciOiJIUzI1NiJ9..."
```

```json
{
  "found": true,
  "data": {
    "runId": "run_123",
    "stepId": "welcome_open",
    "event": "open",
    "firedAt": "2025-03-04T12:00:00.000Z",
    "userAgent": "Mozilla/5.0 ...",
    "ip": "203.0.113.50",
    "country": "US",
    "city": "San Francisco",
    "os": "Windows",
    "deviceType": "desktop"
  }
}
```

**Example — not found**

```json
{
  "found": false
}
```

**Example — unauthorized**

```bash
curl -i "http://localhost:3000/api/events/eyJhbGciOiJIUzI1NiJ9..."
# HTTP/1.1 401 Unauthorized
# {"error":"unauthorized"}
```

---

## 5. Dev-only: latest events

**`GET /dev/events`**

Available only when `NODE_ENV === "development"`. Returns the latest 10 stored events as a plain-text ASCII table. No authentication. In production (or when not in development), responds with **404** and `{ "error": "not_found" }`.

- **Path:** `/dev/events`
- **Success (200):** `Content-Type: text/plain; charset=utf-8` — table with columns: #, runId, stepId, event, url, firedAt.

---

## Tracking context (stored with each event)

For both **open** and **click** events, the server derives a **tracking context** from the request and stores it with the event. Source:

- **Standard headers:** `User-Agent`, `Accept-Language`, `Referer` / `Referrer`
- **IP:** `cf-connecting-ip` (Cloudflare) or first element of `x-forwarded-for`
- **Cloudflare geolocation** (when enabled): country, city, region, region code, continent, latitude, longitude, postal code, timezone
- **User-Agent parsing:** OS name and device type (e.g. mobile, tablet, desktop)

Fields not present in the request are not stored (or stored as null/omitted depending on the store). The same context shape is used for both events; only **click** events additionally store the `url` query parameter.

---

## Summary table

| Endpoint | Auth | Input (key parts) | Success response | Error responses |
|----------|------|-------------------|-------------------|------------------|
| `GET /` | none | — | `200` `{ "ok": true, "crumb": "🍞" }` | — |
| `GET /t/<token>` or `.../token.gif` | none | Path: token | `200` GIF, no-cache headers | — (always 200 + GIF) |
| `GET /r/:token?url=...` | none | Path: token; Query: `url` | `302` `Location: url` | `400` `{ "error": "invalid_tracking_link" }` |
| `GET /api/events/:token` | API key | Path: token; Header: Bearer / x-api-key | `200` `{ "found": true, "data": EventRecord }` or `{ "found": false }` | `401` `{ "error": "unauthorized" }`, `400` `{ "error": "invalid_token" }` |
| `GET /dev/events` | none | — (dev only) | `200` plain-text table | `404` `{ "error": "not_found" }` when not in development |
