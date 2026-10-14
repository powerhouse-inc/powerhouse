import type { ILogger } from "document-model";
import { describe, expect, it, vi } from "vitest";
import { resolveCredentialCacheTtlMs } from "../src/services/renown-config.js";

function makeLogger() {
  const warn = vi.fn();
  const logger = {
    level: "error" as const,
    verbose: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn,
    error: vi.fn(),
    errorHandler: vi.fn(),
    child: () => logger,
  };
  return { logger: logger as unknown as ILogger, warn };
}

describe("resolveCredentialCacheTtlMs", () => {
  // With source=self the check is an in-process read-model query: caching it
  // buys little and delays revocation, so the default is no cache at all.
  it("defaults to 0 (no cache) when renown source is self", () => {
    const { logger } = makeLogger();
    expect(resolveCredentialCacheTtlMs(undefined, "self", logger)).toBe(0);
  });

  it("leaves the AuthService default in place for a remote source", () => {
    const { logger } = makeLogger();
    expect(
      resolveCredentialCacheTtlMs(undefined, "remote", logger),
    ).toBeUndefined();
  });

  it("honours an explicit env override for either source", () => {
    const { logger } = makeLogger();
    expect(resolveCredentialCacheTtlMs("5000", "self", logger)).toBe(5000);
    expect(resolveCredentialCacheTtlMs("0", "remote", logger)).toBe(0);
    expect(resolveCredentialCacheTtlMs("250", "remote", logger)).toBe(250);
  });

  it("warns on an invalid override and falls back to the source default", () => {
    const { logger, warn } = makeLogger();
    expect(resolveCredentialCacheTtlMs("abc", "self", logger)).toBe(0);
    expect(resolveCredentialCacheTtlMs("-1", "remote", logger)).toBeUndefined();
    expect(resolveCredentialCacheTtlMs("  ", "remote", logger)).toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(3);
  });
});
