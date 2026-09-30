// A dispatch always answers a caller that passed a callback: with the result,
// the actions' errors, or why nothing was dispatched.
import type { Action, PHDocument } from "@powerhousedao/shared/document-model";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDispatch } from "../src/hooks/dispatch.js";

const action = {
  id: "a1",
  type: "SET_NAME",
  scope: "global",
  input: { name: "x" },
  timestampUtcMs: "2026-09-29T12:00:00.000Z",
} as unknown as Action;

const document = {
  header: { id: "doc-1" },
  operations: { global: [] },
} as unknown as PHDocument;

type Execute = (id: string, branch: string, actions: Action[]) => unknown;

function withReactor(execute: Execute) {
  vi.stubGlobal("window", { ph: { reactorClient: { execute } } });
}

// Resolves with whichever callback the dispatch answered through.
function outcome(target: PHDocument | undefined) {
  return new Promise<{ errors?: Error[]; result?: PHDocument }>((resolve) => {
    const [, dispatch] = useDispatch(target);
    dispatch(
      action,
      (errors) => resolve({ errors }),
      (result) => resolve({ result }),
    );
  });
}

describe("useDispatch", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("reports a document it cannot find", async () => {
    withReactor(() => Promise.resolve(document));
    const { errors } = await outcome(undefined);
    expect(errors?.[0]?.message).toMatch(/not found/);
  });

  it("reports a write the reactor rejects", async () => {
    withReactor(() => Promise.reject(new Error("network down")));
    const { errors } = await outcome(document);
    expect(errors?.map((error) => error.message)).toEqual(["network down"]);
  });

  it("reports a reactor that is not there", async () => {
    vi.stubGlobal("window", {});
    const { errors } = await outcome(document);
    expect(errors?.[0]?.message).toBe("ReactorClient not initialized");
  });

  it("answers a successful write once, through onSuccess", async () => {
    withReactor(() => Promise.resolve(document));
    const { result } = await outcome(document);
    expect(result).toBe(document);
  });

  it("does not call onErrors again when onErrors itself throws", async () => {
    const failed: PHDocument = {
      ...document,
      operations: { global: [{ action, error: "bad input" }] },
    } as unknown as PHDocument;
    withReactor(() => Promise.resolve(failed));
    const calls: Error[][] = [];
    const [, dispatch] = useDispatch(document);
    dispatch(action, (errors) => {
      calls.push(errors);
      throw new Error("handler failed");
    });
    await vi.waitFor(() => expect(console.error).toHaveBeenCalled());
    expect(calls.map((errors) => errors[0]?.message)).toEqual(["bad input"]);
  });
});
