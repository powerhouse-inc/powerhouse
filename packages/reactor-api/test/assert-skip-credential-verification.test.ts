import { describe, expect, it } from "vitest";
import { assertSkipCredentialVerificationAllowed } from "../src/server.js";

const PROD: NodeJS.ProcessEnv = {}; // unset NODE_ENV — treated as production

describe("assertSkipCredentialVerificationAllowed", () => {
  it("is a no-op when auth is disabled, even with skip + production env", () => {
    expect(() =>
      assertSkipCredentialVerificationAllowed(false, true, PROD),
    ).not.toThrow();
  });

  it("is a no-op when skip is not requested", () => {
    expect(() =>
      assertSkipCredentialVerificationAllowed(true, false, PROD),
    ).not.toThrow();
  });

  it("throws when skip is requested with auth on and NODE_ENV unset (fail closed)", () => {
    expect(() =>
      assertSkipCredentialVerificationAllowed(true, true, PROD),
    ).toThrow(/SKIP_CREDENTIAL_VERIFICATION/);
  });

  it("throws when skip is requested in production", () => {
    expect(() =>
      assertSkipCredentialVerificationAllowed(true, true, {
        NODE_ENV: "production",
      }),
    ).toThrow(/identity spoofing/);
  });

  it("throws in development without the explicit acknowledgment", () => {
    expect(() =>
      assertSkipCredentialVerificationAllowed(true, true, {
        NODE_ENV: "development",
      }),
    ).toThrow(/ALLOW_INSECURE_SKIP_CREDENTIAL_VERIFICATION/);
  });

  it("allows skip under VITEST", () => {
    expect(() =>
      assertSkipCredentialVerificationAllowed(true, true, { VITEST: "true" }),
    ).not.toThrow();
  });

  it("allows skip under NODE_ENV=test", () => {
    expect(() =>
      assertSkipCredentialVerificationAllowed(true, true, { NODE_ENV: "test" }),
    ).not.toThrow();
  });

  it("allows skip when explicitly acknowledged, even in production", () => {
    expect(() =>
      assertSkipCredentialVerificationAllowed(true, true, {
        NODE_ENV: "production",
        ALLOW_INSECURE_SKIP_CREDENTIAL_VERIFICATION: "true",
      }),
    ).not.toThrow();
  });

  it("does not treat a non-'true' acknowledgment as opt-in", () => {
    expect(() =>
      assertSkipCredentialVerificationAllowed(true, true, {
        NODE_ENV: "production",
        ALLOW_INSECURE_SKIP_CREDENTIAL_VERIFICATION: "1",
      }),
    ).toThrow();
  });
});
