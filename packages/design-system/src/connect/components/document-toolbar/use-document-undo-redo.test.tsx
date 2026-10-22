import type { Action, PHDocument } from "@powerhousedao/shared/document-model";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  document: undefined as unknown,
  dispatch: (() => undefined) as (action: unknown) => void,
  client: undefined as unknown,
}));

vi.mock("@powerhousedao/reactor-browser", () => ({
  useDocumentById: () => [state.document, state.dispatch],
  useReactorClient: () => state.client,
}));

const { undoRoute, useDocumentUndoRedo } =
  await import("./use-document-undo-redo.js");

function makeDocument(options: {
  baseReducer?: number;
  global?: number;
  document?: number;
  clipboard?: number;
}): PHDocument {
  return {
    header: {
      id: "doc-1",
      revision: {
        global: options.global ?? 0,
        document: options.document ?? 1,
      },
      protocolVersions:
        options.baseReducer === undefined
          ? undefined
          : { "base-reducer": options.baseReducer },
    },
    clipboard: Array.from({ length: options.clipboard ?? 0 }, () => ({})),
  } as unknown as PHDocument;
}

function makeClient(availability = { canUndo: true, canRedo: true }) {
  return {
    undo: vi.fn(() => Promise.resolve({})),
    redo: vi.fn(() => Promise.resolve({})),
    undoRedoAvailability: vi.fn(() => Promise.resolve(availability)),
  };
}

describe("useDocumentUndoRedo", () => {
  let dispatch: ReturnType<typeof vi.fn<(action: unknown) => void>>;
  let client: ReturnType<typeof makeClient>;

  beforeEach(() => {
    dispatch = vi.fn<(action: unknown) => void>();
    client = makeClient();
    state.dispatch = dispatch;
    state.client = client;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("on base-reducer 2", () => {
    const baseReducer = 2;

    it("reads revisions and the clipboard and dispatches UNDO and REDO", () => {
      state.document = makeDocument({ baseReducer, global: 2, clipboard: 1 });
      const { result } = renderHook(() => useDocumentUndoRedo("doc-1"));

      expect(result.current.canUndo).toBe(true);
      expect(result.current.canRedo).toBe(true);

      result.current.undo();
      result.current.redo();
      const types = dispatch.mock.calls.map(
        ([action]) => (action as Action).type,
      );
      expect(types).toEqual(["UNDO", "REDO"]);
      expect(client.undo).not.toHaveBeenCalled();
      expect(client.redo).not.toHaveBeenCalled();
      expect(client.undoRedoAvailability).not.toHaveBeenCalled();
    });

    it("cannot undo without revisions or redo without a clipboard", () => {
      state.document = makeDocument({ baseReducer, document: 0 });
      const { result } = renderHook(() => useDocumentUndoRedo("doc-1"));

      expect(result.current.canUndo).toBe(false);
      expect(result.current.canRedo).toBe(false);
    });
  });

  // The light client's header: the client resolves the version itself.
  describe("on a header without protocol versions", () => {
    it("undoes and redoes through the client", async () => {
      state.document = makeDocument({ global: 2, clipboard: 1 });
      const { result } = renderHook(() => useDocumentUndoRedo("doc-1"));

      result.current.undo();
      result.current.redo();

      expect(client.undo).toHaveBeenCalledWith("doc-1", "global");
      await waitFor(() =>
        expect(client.redo).toHaveBeenCalledWith("doc-1", "global"),
      );
      expect(dispatch).not.toHaveBeenCalled();
    });

    it("takes availability from the client, not revisions or the clipboard", async () => {
      client = makeClient({ canUndo: false, canRedo: true });
      state.client = client;
      state.document = makeDocument({ global: 2 });
      const { result } = renderHook(() => useDocumentUndoRedo("doc-1"));

      await waitFor(() => expect(result.current.canRedo).toBe(true));
      expect(result.current.canUndo).toBe(false);
      expect(client.undoRedoAvailability).toHaveBeenCalledWith(
        "doc-1",
        "global",
      );
    });
  });

  describe("on base-reducer 3", () => {
    it("cannot undo or redo without a client, and dispatches nothing", () => {
      state.client = undefined;
      state.document = makeDocument({
        baseReducer: 3,
        global: 2,
        clipboard: 1,
      });
      const { result } = renderHook(() => useDocumentUndoRedo("doc-1"));

      expect(result.current.canUndo).toBe(false);
      expect(result.current.canRedo).toBe(false);
      result.current.undo();
      result.current.redo();
      expect(dispatch).not.toHaveBeenCalled();
    });

    it("undoes and redoes through the client", async () => {
      state.document = makeDocument({ baseReducer: 3, global: 2 });
      const { result } = renderHook(() => useDocumentUndoRedo("doc-1"));

      result.current.undo();
      result.current.redo();

      expect(client.undo).toHaveBeenCalledWith("doc-1", "global");
      await waitFor(() =>
        expect(client.redo).toHaveBeenCalledWith("doc-1", "global"),
      );
      expect(dispatch).not.toHaveBeenCalled();
    });

    it("takes availability from the client, not the clipboard", async () => {
      client = makeClient({ canUndo: false, canRedo: true });
      state.client = client;
      state.document = makeDocument({ baseReducer: 3, global: 2 });
      const { result } = renderHook(() => useDocumentUndoRedo("doc-1"));

      expect(result.current.canUndo).toBe(false);
      expect(result.current.canRedo).toBe(false);
      await waitFor(() => expect(result.current.canRedo).toBe(true));
      expect(result.current.canUndo).toBe(false);
    });

    it("reads availability once per revision", async () => {
      state.document = makeDocument({ baseReducer: 3, global: 2 });
      const { result, rerender } = renderHook(() =>
        useDocumentUndoRedo("doc-1"),
      );
      await waitFor(() => expect(result.current.canUndo).toBe(true));

      // A refreshed document object at the same revision.
      state.document = makeDocument({ baseReducer: 3, global: 2 });
      rerender();
      await act(() => Promise.resolve());
      expect(client.undoRedoAvailability).toHaveBeenCalledOnce();
      expect(client.undoRedoAvailability).toHaveBeenCalledWith(
        "doc-1",
        "global",
      );

      state.document = makeDocument({ baseReducer: 3, global: 3 });
      rerender();
      await waitFor(() =>
        expect(client.undoRedoAvailability).toHaveBeenCalledTimes(2),
      );
    });

    it("runs a press only after the one in flight settles", async () => {
      let finishUndo = () => {};
      client.undo.mockImplementation(
        () =>
          new Promise((resolve) => {
            finishUndo = () => resolve({});
          }),
      );
      state.document = makeDocument({ baseReducer: 3, global: 2 });
      const { result } = renderHook(() => useDocumentUndoRedo("doc-1"));

      result.current.undo();
      result.current.redo();
      await act(() => Promise.resolve());
      expect(client.undo).toHaveBeenCalledOnce();
      expect(client.redo).not.toHaveBeenCalled();

      finishUndo();
      await waitFor(() => expect(client.redo).toHaveBeenCalledOnce());
    });

    it("reads again after a failed availability read", async () => {
      const error = vi.spyOn(console, "error").mockImplementation(() => {});
      client.undoRedoAvailability
        .mockImplementationOnce(() => Promise.reject(new Error("offline")))
        .mockImplementation(() =>
          Promise.resolve({ canUndo: true, canRedo: false }),
        );
      state.document = makeDocument({ baseReducer: 3, global: 2 });
      const first = renderHook(() => useDocumentUndoRedo("doc-1"));
      await waitFor(() =>
        expect(error).toHaveBeenCalledWith(
          "Failed to read undo and redo availability:",
          expect.any(Error),
        ),
      );
      expect(first.result.current.canUndo).toBe(false);
      first.unmount();

      const second = renderHook(() => useDocumentUndoRedo("doc-1"));

      await waitFor(() => expect(second.result.current.canUndo).toBe(true));
      expect(client.undoRedoAvailability).toHaveBeenCalledTimes(2);
    });

    it("logs a failed undo instead of rejecting", async () => {
      const error = vi.spyOn(console, "error").mockImplementation(() => {});
      client.undo.mockImplementation(() =>
        Promise.reject(
          new Error("Cannot undo: nothing to undo in scope history"),
        ),
      );
      state.document = makeDocument({ baseReducer: 3, global: 2 });
      const { result } = renderHook(() => useDocumentUndoRedo("doc-1"));

      result.current.undo();

      await waitFor(() =>
        expect(error).toHaveBeenCalledWith(
          "Failed to undo:",
          expect.any(Error),
        ),
      );
    });
  });
});

describe("undoRoute", () => {
  const client = makeClient() as never;

  it("routes by the undo model and whether a client exists", () => {
    const route = (baseReducer: number | undefined, withClient: boolean) =>
      undoRoute(withClient ? client : undefined, makeDocument({ baseReducer }));
    expect(route(1, true)).toBe("dispatch");
    expect(route(2, true)).toBe("dispatch");
    expect(route(2, false)).toBe("dispatch");
    expect(route(3, true)).toBe("client");
    expect(route(3, false)).toBe("none");
    expect(route(undefined, true)).toBe("client");
    expect(route(undefined, false)).toBe("dispatch");
    expect(undoRoute(client, undefined)).toBe("dispatch");
  });
});
