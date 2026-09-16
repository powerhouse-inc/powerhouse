/**
 * Pins that a rejection from `dispatchActions` reaches the log instead of
 * blowing up the error handler.
 *
 * `useDispatch` used to pass `logger.error` as a bare callback. The logger
 * methods read an ECMAScript private field, so the detached method threw
 * `TypeError: Cannot read properties of undefined (reading '#level')` and
 * the original error was swallowed into an unhandled rejection.
 *
 * `console.error` is spied rather than `logger.error`: spying the logger
 * replaces the very method that throws, which makes this test pass against
 * the broken code.
 */
import type { MockInstance } from "vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/actions/dispatch.js", () => ({
  dispatchActions: vi.fn(),
}));

import type { Action, PHDocument } from "@powerhousedao/shared/document-model";
import { dispatchActions } from "../src/actions/dispatch.js";
import { useDispatch } from "../src/hooks/dispatch.js";

type ConsoleFn = (...args: unknown[]) => void;

describe("useDispatch error handling", () => {
  let errorSpy: MockInstance<ConsoleFn>;
  let unhandled: unknown[];
  const onUnhandled = (reason: unknown) => unhandled.push(reason);

  beforeEach(() => {
    vi.mocked(dispatchActions).mockReset();
    errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {}) as unknown as MockInstance<ConsoleFn>;
    unhandled = [];
    process.on("unhandledRejection", onUnhandled);
  });

  afterEach(() => {
    process.off("unhandledRejection", onUnhandled);
    errorSpy.mockRestore();
  });

  it("logs the rejection reason instead of throwing inside the handler", async () => {
    const boom = new Error("queue rejected the actions");
    vi.mocked(dispatchActions).mockRejectedValue(boom);

    const document = { id: "doc-1" } as unknown as PHDocument;
    const [, dispatch] = useDispatch(document);

    dispatch({ type: "SET_NAME", input: { name: "x" } } as unknown as Action);

    await vi.waitFor(() => {
      expect(errorSpy).toHaveBeenCalled();
    });
    // The unhandledRejection event fires on a macrotask boundary.
    await new Promise((resolve) => setTimeout(resolve, 0));

    const output = errorSpy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(output).toContain("queue rejected the actions");
    expect(unhandled).toEqual([]);
  });

  it("does not log when the dispatch resolves", async () => {
    vi.mocked(dispatchActions).mockResolvedValue(undefined);

    const document = { id: "doc-1" } as unknown as PHDocument;
    const [, dispatch] = useDispatch(document);

    dispatch({ type: "SET_NAME", input: { name: "x" } } as unknown as Action);

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(errorSpy).not.toHaveBeenCalled();
    expect(unhandled).toEqual([]);
  });
});
