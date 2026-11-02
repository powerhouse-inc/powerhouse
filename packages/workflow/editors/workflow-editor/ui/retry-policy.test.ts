import { describe, expect, it } from "vitest";
import {
  DEFAULT_RETRY,
  inheritedRetryHint,
  MAX_RETRY_DELAY_SECONDS,
  MAX_STEP_ATTEMPTS,
  normalizeRetry,
  parseRetryOn,
} from "./retry-policy.js";

describe("normalizeRetry", () => {
  it("keeps a policy already within the runtime's bounds", () => {
    expect(normalizeRetry(DEFAULT_RETRY)).toEqual(DEFAULT_RETRY);
  });

  it("clamps attempts to between 1 and the runtime ceiling", () => {
    expect(
      normalizeRetry({ ...DEFAULT_RETRY, maxAttempts: 50 }).maxAttempts,
    ).toBe(MAX_STEP_ATTEMPTS);
    expect(
      normalizeRetry({ ...DEFAULT_RETRY, maxAttempts: 0 }).maxAttempts,
    ).toBe(1);
    expect(
      normalizeRetry({ ...DEFAULT_RETRY, maxAttempts: 2.7 }).maxAttempts,
    ).toBe(2);
  });

  it("caps delays at the runtime's longest wait", () => {
    const retry = normalizeRetry({
      ...DEFAULT_RETRY,
      initialDelaySeconds: 1000,
      maxDelaySeconds: 2000,
    });
    expect(retry.initialDelaySeconds).toBe(MAX_RETRY_DELAY_SECONDS);
    expect(retry.maxDelaySeconds).toBe(MAX_RETRY_DELAY_SECONDS);
  });

  it("never lets the longest delay fall below the first", () => {
    const retry = normalizeRetry({
      ...DEFAULT_RETRY,
      initialDelaySeconds: 30,
      maxDelaySeconds: 10,
    });
    expect(retry.maxDelaySeconds).toBe(30);
  });

  it("drops blank error classes", () => {
    expect(
      normalizeRetry({ ...DEFAULT_RETRY, retryOn: [" TRANSIENT ", ""] })
        .retryOn,
    ).toEqual(["TRANSIENT"]);
  });
});

describe("parseRetryOn", () => {
  it("splits a comma list and drops empties", () => {
    expect(parseRetryOn(" TRANSIENT, ,RATE_LIMIT ")).toEqual([
      "TRANSIENT",
      "RATE_LIMIT",
    ]);
    expect(parseRetryOn("")).toEqual([]);
  });
});

describe("inheritedRetryHint", () => {
  it("says nothing for an action with no default", () => {
    expect(inheritedRetryHint(3, undefined)).toBeNull();
  });

  it("clamps the action's attempts to the runtime ceiling", () => {
    expect(inheritedRetryHint(undefined, 50)).toBe(
      `This action makes up to ${MAX_STEP_ATTEMPTS} attempts unless the step sets a retry.`,
    );
    expect(inheritedRetryHint(1, 1)).toBe(
      "This action runs once unless the step sets a retry.",
    );
  });

  it("names the workflow's default over the action's when it retries", () => {
    expect(inheritedRetryHint(40, 2)).toBe(
      `The workflow's default retry (up to ${MAX_STEP_ATTEMPTS} attempts) applies, not this action's.`,
    );
    // The document's initial default retries nothing.
    expect(inheritedRetryHint(1, 2)).toBe(
      "This action makes up to 2 attempts unless the step sets a retry.",
    );
  });
});
