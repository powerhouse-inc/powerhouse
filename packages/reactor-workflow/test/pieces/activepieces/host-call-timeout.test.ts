// The host-call cap: configurable, never shorter than the step's own timeout,
// and a timeout on a WRITING call is indeterminate rather than failed
// (backlog item 6).
import { describe, expect, it } from "vitest";
import {
  DEFAULT_HOST_CALL_TIMEOUT_MS,
  HostCallIndeterminateError,
  HostCallTimeoutError,
  INDETERMINATE_ERROR_NAME,
  MUTATING_HOST_CALLS,
} from "../../../src/pieces/activepieces/worker/host-call.js";
import {
  HOST_CALL_TIMEOUT_ENV,
  hostCallTimeoutForStep,
} from "../../../src/pieces/activepieces/context/limits.js";
import {
  INDETERMINATE_FLAG,
  isIndeterminateError,
} from "../../../src/pieces/activepieces/indeterminate.js";
import { ReactorJobPendingError } from "@powerhousedao/pieces-framework";
import {
  STORE_DELETE,
  STORE_GET,
  STORE_PUT,
} from "../../../src/pieces/activepieces/worker/protocol.js";

describe("the host-call cap", () => {
  it("defaults to ten seconds when nothing says otherwise", () => {
    expect(hostCallTimeoutForStep(undefined, {})).toBe(
      DEFAULT_HOST_CALL_TIMEOUT_MS,
    );
  });

  it("takes the operator's value", () => {
    expect(
      hostCallTimeoutForStep(undefined, {
        [HOST_CALL_TIMEOUT_ENV]: "45000",
      }),
    ).toBe(45_000);
  });

  it("is never shorter than the step's own timeout", () => {
    // The whole point of backlog item 6: a step the author gave two minutes
    // must not have its host calls cut off after ten seconds.
    expect(hostCallTimeoutForStep(120_000, {})).toBe(120_000);
    expect(
      hostCallTimeoutForStep(5_000, { [HOST_CALL_TIMEOUT_ENV]: "20000" }),
    ).toBe(20_000);
  });

  it("falls back on a value that is not a positive number", () => {
    for (const raw of ["", "nope", "0", "-5"]) {
      expect(
        hostCallTimeoutForStep(undefined, { [HOST_CALL_TIMEOUT_ENV]: raw }),
      ).toBe(DEFAULT_HOST_CALL_TIMEOUT_MS);
    }
  });
});

describe("which host calls are indeterminate on timeout", () => {
  it("names every call that may have committed something", () => {
    expect([...MUTATING_HOST_CALLS].sort()).toEqual(
      [STORE_DELETE, STORE_PUT].sort(),
    );
    // Reads are not in it: a read that did not answer is just a read.
    expect(MUTATING_HOST_CALLS).not.toContain(STORE_GET);
  });

  it("carries the distinction as an enumerable property, which survives IPC", () => {
    // The child serializes an error to a name, a message and its own
    // enumerable properties; the class does not cross the boundary.
    const indeterminate = new HostCallIndeterminateError(STORE_PUT, 10);
    expect(indeterminate.name).toBe(INDETERMINATE_ERROR_NAME);
    expect(isIndeterminateError(indeterminate)).toBe(true);
    expect(Object.keys(indeterminate)).toContain(INDETERMINATE_FLAG);
    expect(indeterminate.message).toContain(
      "whether it was committed is unknown",
    );

    expect(isIndeterminateError(new HostCallTimeoutError(STORE_GET, 10))).toBe(
      false,
    );
  });

  it("recognises the marker after a round trip through the worker boundary", () => {
    // What PieceWorkerError carries: the serialized record, properties and all.
    const crossed = Object.assign(new Error("HostCallIndeterminateError: …"), {
      serialized: {
        name: INDETERMINATE_ERROR_NAME,
        message: "…",
        properties: { [INDETERMINATE_FLAG]: true },
      },
    });

    expect(isIndeterminateError(crossed)).toBe(true);
  });

  it("recognises a reactor job still unfinished at the deadline by name", () => {
    // The reactor RPC keeps only an error's name and message.
    const pending = new Error("Reactor job job-1 was still RUNNING");
    pending.name = ReactorJobPendingError;
    expect(isIndeterminateError(pending)).toBe(true);

    const crossed = Object.assign(new Error("…"), {
      serialized: {
        name: ReactorJobPendingError,
        message: "…",
        properties: {},
      },
    });
    expect(isIndeterminateError(crossed)).toBe(true);
  });
});
