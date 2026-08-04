import { describe, expect, it } from "vitest";
import {
  AuthTimestampNotMonotonicError,
  AuthorizationDeniedError,
  ExcessiveReshuffleError,
  InvalidOperationTimestampError,
} from "../../src/shared/errors.js";
import {
  classifyJobFailure,
  quarantinesDocument,
} from "../../src/sync/utils.js";

/**
 * Keyed on the error name, which is all that survives the pooled-worker boundary,
 * and derived centrally so the classification cannot drift per throw site.
 */
describe("classifyJobFailure", () => {
  it("names a held auth operation", () => {
    const error = new AuthTimestampNotMonotonicError(
      "doc",
      "main",
      "2026-01-01T00:00:01.000Z",
      "2026-01-01T00:00:02.000Z",
    );

    expect(classifyJobFailure(error.name)).toBe("AUTH_TIMESTAMP_NOT_MONOTONIC");
  });

  // Previously declared and never produced, so the member was decorative.
  it("names an excessive reshuffle", () => {
    const error = new ExcessiveReshuffleError("doc", "global", 2000, 1000);

    expect(classifyJobFailure(error.name)).toBe("EXCESSIVE_SHUFFLE");
  });

  it("names a malformed timestamp", () => {
    const error = new InvalidOperationTimestampError(
      "doc",
      "auth",
      "not-a-timestamp",
      "auth operation",
    );

    expect(classifyJobFailure(error.name)).toBe("INVALID_TIMESTAMP");
  });

  it("falls back to UNCLASSIFIED for anything it does not know", () => {
    expect(classifyJobFailure("Error")).toBe("UNCLASSIFIED");
    expect(
      classifyJobFailure(new AuthorizationDeniedError("d", "s", "o").name),
    ).toBe("UNCLASSIFIED");
  });

  // A rehydrated error classifies the same way as a live one.
  it("classifies a rehydrated error by name alone", () => {
    const rehydrated = new Error("whatever");
    rehydrated.name = "AuthTimestampNotMonotonicError";

    expect(classifyJobFailure(rehydrated.name)).toBe(
      "AUTH_TIMESTAMP_NOT_MONOTONIC",
    );
  });
});

/**
 * Quarantining a held auth operation would freeze the traffic needed to reconcile
 * the two policies, permanently, since nothing ever clears a quarantine.
 */
describe("quarantinesDocument", () => {
  it("exempts a held auth operation", () => {
    expect(quarantinesDocument("AUTH_TIMESTAMP_NOT_MONOTONIC")).toBe(false);
  });

  it("quarantines every other classification", () => {
    for (const errorType of [
      "SIGNATURE_INVALID",
      "HASH_MISMATCH",
      "LIBRARY_ERROR",
      "MISSING_OPERATIONS",
      "EXCESSIVE_SHUFFLE",
      "GRACEFUL_ABORT",
      "INVALID_TIMESTAMP",
      "UNCLASSIFIED",
    ] as const) {
      expect(quarantinesDocument(errorType)).toBe(true);
    }
  });
});
