/* eslint-disable logger/extra-args-without-token --
 * This file deliberately exercises the no-@token + positional-Error
 * call shape to assert the runtime appends the extras. The lint rule
 * would otherwise flag every test case here.
 */
/**
 * Pins the `ConsoleLogger` token-substitution + Error-handling contract.
 *
 * Background: the original `formatMessage` had two bugs that silently
 * dropped errors at call sites in switchboard / reactor-api:
 *   1. Positional replacements past the unique-`@token` count were
 *      ignored entirely → `logger.error("...:", err)` dropped `err`.
 *   2. `Error` values hit the generic object branch and were rendered
 *      via `JSON.stringify`, which returns `"{}"` because Error's own
 *      properties are non-enumerable → the cause was lost.
 *
 * The fix: Error gets a dedicated branch (`name: message`, plus stack at
 * debug/verbose levels), and trailing replacements are appended to the
 * message rather than discarded. The full stack is gated by log level so
 * production logs across apps stay readable.
 */
import type { MockInstance } from "vitest";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { ConsoleLogger } from "../src/logger.js";

type ConsoleFn = (...args: unknown[]) => void;

describe("ConsoleLogger error formatting", () => {
  let errorSpy: MockInstance<ConsoleFn>;
  let debugSpy: MockInstance<ConsoleFn>;

  beforeEach(() => {
    errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {}) as unknown as MockInstance<ConsoleFn>;
    debugSpy = vi
      .spyOn(console, "debug")
      .mockImplementation(() => {}) as unknown as MockInstance<ConsoleFn>;
  });

  afterEach(() => {
    errorSpy.mockRestore();
    debugSpy.mockRestore();
  });

  const lastErr = (): string => {
    const calls = errorSpy.mock.calls;
    return calls[calls.length - 1]?.[0] as string;
  };

  const lastDebug = (): string => {
    const calls = debugSpy.mock.calls;
    return calls[calls.length - 1]?.[0] as string;
  };

  it("appends positional Error replacements when the message has no @token", () => {
    // Pre-fix call site shape in reactor-api:
    //   logger.error("API dispose: db closer failed:", error);
    const logger = new ConsoleLogger();
    const err = new Error("boom");

    logger.error("API dispose: db closer failed:", err);

    const out = lastErr();
    expect(out).toContain("API dispose: db closer failed:");
    expect(out).toContain("Error: boom");
  });

  it("renders Error via @token as 'name: message' (no stack at info/error level)", () => {
    // Pre-fix call site in switchboard: logger.error("App crashed: @error", e)
    const logger = new ConsoleLogger();
    const err = new Error("real cause");

    logger.error("App crashed: @error", err);

    const out = lastErr();
    expect(out).toContain("App crashed: Error: real cause");
    // Stack is suppressed at default (info) level.
    expect(out).not.toMatch(/at .*logger\.test\.ts/);
  });

  it("includes the stack when level is debug", () => {
    const logger = new ConsoleLogger();
    logger.level = "debug";
    const err = new Error("with stack");

    logger.error("App crashed: @error", err);

    const out = lastErr();
    expect(out).toContain("Error: with stack");
    expect(out).toMatch(/at .*logger\.test\.ts/);
  });

  it("includes the stack when level is verbose", () => {
    const logger = new ConsoleLogger();
    logger.level = "verbose";
    const err = new Error("verbose stack");

    logger.error("oops:", err);

    const out = lastErr();
    expect(out).toMatch(/at .*logger\.test\.ts/);
  });

  it("suppresses stack at warn level", () => {
    const logger = new ConsoleLogger();
    logger.level = "warn";
    const err = new Error("warn-level");

    logger.error("oops:", err);
    const out = lastErr();
    expect(out).toContain("Error: warn-level");
    expect(out).not.toMatch(/at .*logger\.test\.ts/);
  });

  it("renders null/undefined replacement as 'null'", () => {
    const logger = new ConsoleLogger();
    logger.error("got @value", null);
    expect(lastErr()).toContain("got null");
  });

  it("renders a string replacement verbatim", () => {
    const logger = new ConsoleLogger();
    logger.error("App crashed: @msg", "boom");
    expect(lastErr()).toContain("App crashed: boom");
  });

  it("renders a plain object replacement via JSON.stringify", () => {
    const logger = new ConsoleLogger();
    logger.error("ctx=@ctx", { driveId: "abc", count: 2 });
    expect(lastErr()).toContain(`ctx={"driveId":"abc","count":2}`);
  });

  it("uses only the first replacement per unique token, appending extras", () => {
    const logger = new ConsoleLogger();
    logger.error("a=@a b=@b a-again=@a", "A", "B", "EXTRA");

    const out = lastErr();
    expect(out).toContain("a=A b=B a-again=A");
    // Past the unique-token count, extras are appended rather than dropped.
    expect(out).toContain("EXTRA");
  });

  it("renders 'null' for an unmatched @token", () => {
    const logger = new ConsoleLogger();
    // Intentionally under-provisioned to assert the "null" fallback —
    // the lint rule would otherwise flag this as a missing replacement.
    // eslint-disable-next-line logger/missing-token-args
    logger.error("missing: @thing");
    expect(lastErr()).toContain("missing: null");
  });

  it("appends multiple trailing Error replacements", () => {
    const logger = new ConsoleLogger();
    logger.error("two failures:", new Error("first"), new Error("second"));
    const out = lastErr();
    expect(out).toContain("Error: first");
    expect(out).toContain("Error: second");
  });

  it("debug() honors the same stack rule", () => {
    const logger = new ConsoleLogger();
    logger.level = "debug";
    const err = new Error("dbg");

    logger.debug("trace:", err);

    expect(lastDebug()).toMatch(/at .*logger\.test\.ts/);
  });
});

/**
 * Pins the "method survives leaving its instance" contract.
 *
 * The log methods read the private field `#level`, so a method that is
 * passed as a bare callback (`.catch(logger.error)`) or copied onto
 * another object (reactor-api's `createViteLogger`, which assigns
 * `customLogger.error = logger.error`) used to throw from inside the
 * logger itself — losing the very error it was handed.
 */
describe("ConsoleLogger detached methods", () => {
  type ConsoleName = "error" | "warn" | "info" | "debug";
  let spies: Record<ConsoleName, MockInstance<ConsoleFn>>;

  beforeEach(() => {
    const spyOn = (name: ConsoleName) =>
      vi
        .spyOn(console, name)
        .mockImplementation(() => {}) as unknown as MockInstance<ConsoleFn>;
    spies = {
      error: spyOn("error"),
      warn: spyOn("warn"),
      info: spyOn("info"),
      debug: spyOn("debug"),
    };
  });

  afterEach(() => {
    for (const spy of Object.values(spies)) spy.mockRestore();
  });

  const last = (spy: MockInstance<ConsoleFn>): string => {
    const calls = spy.mock.calls;
    return calls[calls.length - 1]?.[0] as string;
  };

  const cases = [
    ["verbose", "debug"],
    ["debug", "debug"],
    ["info", "info"],
    ["warn", "warn"],
    ["error", "error"],
  ] as const;

  for (const [method, consoleFn] of cases) {
    it(`${method}() works when detached from the instance`, () => {
      const log = new ConsoleLogger();
      log.level = "verbose";

      const detached: (message: string, ...replacements: any[]) => void =
        log[method];

      expect(() => {
        detached("detached @which", method);
      }).not.toThrow();
      expect(last(spies[consoleFn])).toContain(`detached ${method}`);
    });
  }

  it("works when re-homed onto a foreign object (createViteLogger shape)", () => {
    const log = new ConsoleLogger();
    const foreign: {
      error: (message: string, ...replacements: any[]) => void;
    } = { error: () => {} };

    // Pre-fix this threw "Cannot read private member #level from an object
    // whose class did not declare it" — a different failure from the bare
    // callback case, but the same root cause.
    foreign.error = log.error;

    expect(() => {
      foreign.error("rehomed @what", "boom");
    }).not.toThrow();
    expect(last(spies.error)).toContain("rehomed boom");
  });

  it("keeps the instance's own tags and level when detached", () => {
    const log = new ConsoleLogger(["pkg", "mod"]);
    log.level = "error";
    const detached = log.error;
    const detachedInfo = log.info;

    detachedInfo("should not be emitted @x", 1);
    expect(spies.info).not.toHaveBeenCalled();

    detached("still tagged @x", 1);
    expect(last(spies.error)).toContain("[pkg][mod] still tagged 1");
  });
});
