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

    // JWT format: header.payload.signature
    expect(token.split(".")).toHaveLength(3);
  });

  it("returns null for tampered signature", () => {
    const token = encodeToken({
      runId: "run_123",
      stepId: "welcome:open",
      secret: "test-secret",
    });
    const [header, payload] = token.split(".");
    const tamperedToken = `${header}.${payload}.invalidsig`;

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
