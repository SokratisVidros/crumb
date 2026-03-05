import type { TrackingContext } from "./types";

type UAParseResult = { os?: { name?: string }; device?: { type?: string } };
// ua-parser-js uses export= ; avoid default import without esModuleInterop
const parseUA = (ua: string): UAParseResult => {
  const p = require("ua-parser-js")(ua) as UAParseResult;
  const out: UAParseResult = {};
  if (p?.os) out.os = p.os;
  if (p?.device) out.device = p.device;
  return out;
};

/**
 * Reads client IP with Cloudflare and common proxy fallbacks.
 * @see https://developers.cloudflare.com/fundamentals/reference/http-request-headers/#cf-connecting-ip
 */
export function readIp(request: Request): string | undefined {
  const cfConnectingIp = request.headers.get("cf-connecting-ip");
  if (cfConnectingIp) {
    return cfConnectingIp;
  }

  const xForwardedFor = request.headers.get("x-forwarded-for");
  if (!xForwardedFor) {
    return undefined;
  }

  return xForwardedFor.split(",")[0]?.trim() || undefined;
}

/**
 * Builds full tracking context from the request:
 * - User-Agent, Referer, Accept-Language (standard headers)
 * - Cloudflare geolocation headers when behind CF (country, city, region, etc.)
 * - OS and device type parsed from User-Agent (fallback when not behind CF)
 * All fields are optional; missing headers yield undefined (e.g. local dev).
 * @see https://developers.cloudflare.com/network/ip-geolocation/
 * @see https://developers.cloudflare.com/rules/transform/managed-transforms/reference/#add-visitor-location-headers
 */
export function getTrackingContext(request: Request): TrackingContext {
  const ctx: TrackingContext = {};

  const userAgent = request.headers.get("user-agent") ?? undefined;
  if (userAgent) {
    ctx.userAgent = userAgent;
  }

  const ip = readIp(request);
  if (ip) {
    ctx.ip = ip;
  }

  const acceptLanguage = request.headers.get("accept-language") ?? undefined;
  if (acceptLanguage) {
    ctx.acceptLanguage = acceptLanguage;
  }

  const referer = request.headers.get("referer") ?? request.headers.get("referrer") ?? undefined;
  if (referer) {
    ctx.referer = referer;
  }

  // Cloudflare visitor location headers (when "Add visitor location headers" or IP Geolocation is on)
  const cfCountry = request.headers.get("cf-ipcountry") ?? undefined;
  if (cfCountry) {
    ctx.country = cfCountry;
  }

  const cfCity = request.headers.get("cf-ipcity") ?? undefined;
  if (cfCity) {
    ctx.city = cfCity;
  }

  const cfRegion = request.headers.get("cf-region") ?? undefined;
  if (cfRegion) {
    ctx.region = cfRegion;
  }

  const cfRegionCode = request.headers.get("cf-region-code") ?? undefined;
  if (cfRegionCode) {
    ctx.regionCode = cfRegionCode;
  }

  const cfContinent = request.headers.get("cf-ipcontinent") ?? undefined;
  if (cfContinent) {
    ctx.continent = cfContinent;
  }

  const cfLat = request.headers.get("cf-iplatitude") ?? undefined;
  if (cfLat) {
    ctx.latitude = cfLat;
  }

  const cfLon = request.headers.get("cf-iplongitude") ?? undefined;
  if (cfLon) {
    ctx.longitude = cfLon;
  }

  const cfPostalCode = request.headers.get("cf-postal-code") ?? undefined;
  if (cfPostalCode) {
    ctx.postalCode = cfPostalCode;
  }

  const cfTimezone = request.headers.get("cf-timezone") ?? undefined;
  if (cfTimezone) {
    ctx.timezone = cfTimezone;
  }

  // OS and device type from User-Agent (works everywhere, including local dev)
  if (userAgent) {
    try {
      const parsed = parseUA(userAgent);
      const osName = parsed.os?.name;
      if (osName) {
        ctx.os = osName;
      }
      const deviceType = parsed.device?.type;
      if (deviceType) {
        ctx.deviceType = deviceType;
      }
    } catch {
      // ignore parse errors; leave os/deviceType unset
    }
  }

  return ctx;
}
