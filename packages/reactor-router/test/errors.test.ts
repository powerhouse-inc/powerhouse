import { describe, expect, it } from "vitest";
import {
  FanInPartialFailureError,
  isOperationNotSupported,
  OPERATION_NOT_SUPPORTED_CODE,
  ReactorOperationNotSupportedError,
} from "../src/index.js";

describe("isOperationNotSupported", () => {
  it("recognises the live typed error in-realm by its prototype", () => {
    const error = new ReactorOperationNotSupportedError({
      backend: "switchboard-remote",
      operation: "find",
    });

    expect(isOperationNotSupported(error)).toBe(true);
  });

  it("recognises an in-realm object carrying the structured code property", () => {
    // A non-instance object that still carries the explicit code: the in-realm
    // structured signal, independent of the message text.
    const shaped = { code: OPERATION_NOT_SUPPORTED_CODE, message: "anything" };

    expect(isOperationNotSupported(shaped)).toBe(true);
  });

  it("recognises the error across the RPC boundary by name and by the full structured message", () => {
    // What reactor-browser's RPC rebuild yields: a plain object with the
    // error's name and message, the prototype and own `code` gone.
    const byName = {
      name: "ReactorOperationNotSupportedError",
      message: "whatever the wire carried",
    };
    const byMessage = {
      name: "Error",
      message: `${OPERATION_NOT_SUPPORTED_CODE}: backend "switchboard-remote" does not support "find"`,
    };

    expect(isOperationNotSupported(byName)).toBe(true);
    expect(isOperationNotSupported(byMessage)).toBe(true);
  });

  it("does NOT classify a genuine error whose message merely starts with the code text", () => {
    // The false-positive the tightening closes: a real runtime failure whose
    // message coincidentally opens with the code prefix must fail loud, not be
    // silently swallowed as a by-contract limitation.
    const genuine = new Error(
      "operation-not-supported: the storage backend rejected the write",
    );
    const genuineObject = {
      name: "Error",
      message: "operation-not-supported: disk full",
    };

    expect(isOperationNotSupported(genuine)).toBe(false);
    expect(isOperationNotSupported(genuineObject)).toBe(false);
  });

  it("does NOT classify an arbitrary non-error value", () => {
    expect(isOperationNotSupported(undefined)).toBe(false);
    expect(isOperationNotSupported(null)).toBe(false);
    expect(isOperationNotSupported("operation-not-supported:")).toBe(false);
    expect(isOperationNotSupported(new Error("some other failure"))).toBe(
      false,
    );
  });
});

describe("FanInPartialFailureError", () => {
  it("carries the excluded backends with their reasons alongside the failures", () => {
    const error = new FanInPartialFailureError(
      "find",
      [{ backend: "capable", error: new Error("boom") }],
      [],
      [{ backend: "switchboard-remote", reason: "does not support find" }],
    );

    expect(error.excluded).toEqual([
      { backend: "switchboard-remote", reason: "does not support find" },
    ]);
    expect(error.message).toMatch(/also excluded as not applicable/);
    expect(error.message).toMatch(/switchboard-remote/);
  });

  it("reads as an all-excluded error when nothing answered and nothing failed", () => {
    const error = new FanInPartialFailureError(
      "find",
      [],
      [],
      [
        { backend: "one", reason: "does not support find" },
        { backend: "two", reason: "does not support find" },
      ],
    );

    expect(error.failures).toEqual([]);
    expect(error.message).toMatch(
      /every backend was excluded as not applicable/,
    );
  });
});
