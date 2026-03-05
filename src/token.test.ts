import { describe, expect, it } from "bun:test";
import { decodeAndVerifyToken, encodeToken } from "./token";

describe("token helpers", () => {
  it("encodes and decodes a valid token", () => {
    const token = encodeToken({
      runId: "run_123",
      stepId: "welcome:open",
      secret: "test-secret",
    });

    const parsed = decodeAndVerifyToken({
      token,
      secret: "test-secret",
    });

    expect(parsed).toEqual({
      runId: "run_123",
      stepId: "welcome:open",
    });

    // Token format: base64url-hmac (one dash, 12-char hex suffix)
    expect(token).toMatch(/^[A-Za-z0-9_-]+-[0-9a-f]{12}$/);
  });

  it("returns null for tampered signature", () => {
    const token = encodeToken({
      runId: "run_123",
      stepId: "welcome:open",
      secret: "test-secret",
    });
    const lastDash = token.lastIndexOf("-");
    const tamperedToken = `${token.slice(0, lastDash + 1)}000000000000`;

    const parsed = decodeAndVerifyToken({
      token: tamperedToken,
      secret: "test-secret",
    });

    expect(parsed).toBeNull();
  });

  it("returns null for malformed token format", () => {
    const parsed = decodeAndVerifyToken({
      token: "not-a-valid-token",
      secret: "test-secret",
    });

    expect(parsed).toBeNull();
  });

  it("returns null when verified with the wrong secret", () => {
    const token = encodeToken({
      runId: "run_123",
      stepId: "welcome:open",
      secret: "test-secret",
    });

    const parsed = decodeAndVerifyToken({
      token,
      secret: "different-secret",
    });

    expect(parsed).toBeNull();
  });
});
