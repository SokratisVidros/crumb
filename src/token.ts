import { createHmac, timingSafeEqual } from "node:crypto";

type TokenParts = {
  runId: string;
  stepId: string;
};

type DecodeTokenParams = {
  token: string;
  secret: string;
};

/** Token format: base64url(runId:stepId)-first12hex(hmac-sha256). */
const HMAC_LEN = 12;
const TOKEN_SEP = "-";

export function createToken(runId: string, stepId: string, secret: string): string {
  const payload = `${runId}:${stepId}`;
  const encoded = Buffer.from(payload, "utf8").toString("base64url");
  const hmac = createHmac("sha256", secret).update(payload).digest("hex").slice(0, HMAC_LEN);
  return `${encoded}${TOKEN_SEP}${hmac}`;
}

export const encodeToken = ({ runId, stepId, secret }: TokenParts & { secret: string }) => {
  return createToken(runId, stepId, secret);
};

function hexChars(s: string): boolean {
  return /^[0-9a-f]+$/.test(s) && s.length === HMAC_LEN;
}

export const decodeAndVerifyToken = ({ token, secret }: DecodeTokenParams): TokenParts | null => {
  const lastSep = token.lastIndexOf(TOKEN_SEP);
  if (lastSep === -1) return null;

  const encoded = token.slice(0, lastSep);
  const hmacStored = token.slice(lastSep + 1);

  if (!encoded || !hexChars(hmacStored)) return null;

  let payload: string;
  try {
    payload = Buffer.from(encoded, "base64url").toString("utf8");
  } catch {
    return null;
  }

  const colon = payload.indexOf(":");
  if (colon === -1) return null;

  const runId = payload.slice(0, colon);
  const stepId = payload.slice(colon + 1);
  if (!runId || !stepId) return null;

  const expectedHmac = createHmac("sha256", secret)
    .update(payload)
    .digest("hex")
    .slice(0, HMAC_LEN);
  const a = Buffer.from(hmacStored, "utf8");
  const b = Buffer.from(expectedHmac, "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  return { runId, stepId };
};
