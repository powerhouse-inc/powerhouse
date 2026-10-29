// @vitest-environment happy-dom
import { ensurePHStore } from "@powerhousedao/reactor-browser";
import type { DocumentDriveDocument } from "@powerhousedao/shared/document-drive";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type {
  Action,
  Operation,
  PHDocument,
} from "@powerhousedao/shared/document-model";
import { vi } from "vitest";
import type * as ReactorBrowser from "@powerhousedao/reactor-browser";
import { BackButton } from "./editor-chrome.js";
import { UndoRedo } from "./editor-chrome.js";

// UndoRedo's document comes from here; every other hook is the real one.
const undoState = vi.hoisted(() => ({
  document: undefined as unknown,
  dispatch: (() => undefined) as (actions: unknown, ...rest: unknown[]) => void,
}));
vi.mock("@powerhousedao/reactor-browser", async (importOriginal) => {
  const original = await importOriginal<typeof ReactorBrowser>();
  return {
    ...original,
    useDocumentById: (id: string | undefined) =>
      undoState.document === undefined
        ? original.useDocumentById(id)
        : [undoState.document, undoState.dispatch],
  };
});

const search = () => Object.fromEntries(new URLSearchParams(location.search));

beforeEach(() => {
  ensurePHStore().navigation = undefined;
});

afterEach(() => {
  cleanup();
  const store = ensurePHStore();
  store.drives = undefined;
  store.selectedDriveId = undefined;
  store.selectedNodeId = undefined;
  window.history.replaceState(null, "", "/");
});

describe("BackButton", () => {
  it("leads a deep-linked editor to the studio root, keeping its item", () => {
    // The workflow sits in the studio's hidden home folder.
    const store = ensurePHStore();
    store.drives = [
      {
        header: { id: "drive-1", slug: "studio" },
        state: {
          global: {
            nodes: [
              { id: "home", kind: "folder", name: "home", parentFolder: null },
              { id: "wf-1", kind: "file", name: "wf", parentFolder: "home" },
            ],
          },
        },
      } as unknown as DocumentDriveDocument,
    ];
    store.selectedDriveId = "drive-1";
    window.history.replaceState(null, "", "/d/studio/wf-1?item=wf-1&step=s1");
    render(<BackButton documentId="wf-1" />);

    fireEvent.click(screen.getByText("Back"));

    expect(location.pathname).toBe("/d/studio");
    expect(search()).toEqual({ item: "wf-1" });
  });
});

describe("UndoRedo", () => {
  const editRow = (index: number): Operation =>
    ({
      id: `op-${index}`,
      index,
      skip: 0,
      timestampUtcMs: new Date(index * 1000).toISOString(),
      hash: "",
      action: {
        id: `action-${index}`,
        type: "ADD_STEP",
        input: {},
        scope: "global",
        timestampUtcMs: new Date(index * 1000).toISOString(),
      },
    }) as Operation;
  const createRow = (protocolVersions?: Record<string, number>): Operation =>
    ({
      ...editRow(0),
      action: {
        ...editRow(0).action,
        type: "CREATE_DOCUMENT",
        scope: "document",
        input: { protocolVersions },
      },
    }) as Operation;

  let sent: Action[][];

  function mount(options: {
    header?: Record<string, number>;
    createdAs?: Record<string, number>;
  }) {
    sent = [];
    undoState.document = {
      header: {
        id: "wf-1",
        revision: { global: 1 },
        protocolVersions: options.header,
      },
      operations: {},
    } as unknown as PHDocument;
    undoState.dispatch = (actions, _onErrors, onSuccess) => {
      sent.push(actions as Action[]);
      (onSuccess as () => void)();
    };
    ensurePHStore().reactorClient = {
      getOperations: (_id: string, view: { scopes: string[] }) =>
        Promise.resolve({
          results: view.scopes.includes("document")
            ? [createRow(options.createdAs)]
            : [editRow(0)],
        }),
    } as never;
    render(<UndoRedo documentId="wf-1" />);
  }

  const sentTypes = () =>
    sent.map((actions) => actions.map((action) => action.type));

  afterEach(() => {
    undoState.document = undefined;
    ensurePHStore().reactorClient = undefined;
  });

  it("dispatches UNDO on base-reducer 2", async () => {
    mount({ header: { "base-reducer": 2 } });
    fireEvent.click(screen.getByLabelText("Undo"));
    await vi.waitFor(() => expect(sentTypes()).toEqual([["UNDO"]]));
  });

  it("dispatches UNDO on a header without a version whose CREATE_DOCUMENT names 2", async () => {
    mount({ createdAs: { "base-reducer": 2 } });
    fireEvent.click(screen.getByLabelText("Undo"));
    await vi.waitFor(() => expect(sentTypes()).toEqual([["UNDO"]]));
  });

  it("retracts the last edit on base-reducer 3", async () => {
    mount({ header: { "base-reducer": 3 } });
    await vi.waitFor(() =>
      expect(screen.getByLabelText("Undo")).not.toHaveProperty(
        "disabled",
        true,
      ),
    );
    fireEvent.click(screen.getByLabelText("Undo"));
    await vi.waitFor(() => expect(sentTypes()).toEqual([["RETRACT"]]));
    expect(sent[0][0].input).toEqual({ target: "action-0" });
  });

  it("retracts on a header without a version whose CREATE_DOCUMENT names 3", async () => {
    mount({ createdAs: { "base-reducer": 3 } });
    fireEvent.click(screen.getByLabelText("Undo"));
    await vi.waitFor(() => expect(sentTypes()).toEqual([["RETRACT"]]));
  });

  // No version and no cached CREATE_DOCUMENT; a dispatched UNDO lands as a NOOP.
  function mountVersionless(creation: () => Promise<Operation[]>) {
    sent = [];
    const reads = { document: 0 };
    const history = [editRow(0)];
    undoState.document = {
      header: { id: "wf-1", revision: { global: 1 } },
      operations: {},
    } as unknown as PHDocument;
    undoState.dispatch = (actions, _onErrors, onSuccess) => {
      sent.push(actions as Action[]);
      for (const action of actions as Action[]) {
        const row = editRow(history.length);
        history.push({
          ...row,
          action:
            action.type === "UNDO" ? { ...row.action, type: "NOOP" } : action,
        });
      }
      (onSuccess as () => void)();
    };
    ensurePHStore().reactorClient = {
      getOperations: async (_id: string, view: { scopes: string[] }) => {
        if (!view.scopes.includes("document")) {
          return { results: [...history] };
        }
        reads.document++;
        return { results: await creation() };
      },
    } as never;
    render(<UndoRedo documentId="wf-1" />);
    return reads;
  }

  it("undoes and redoes by dispatch when the creation read fails on a header without a version", async () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    mountVersionless(() => Promise.reject(new Error("offline")));
    fireEvent.click(screen.getByLabelText("Undo"));
    await vi.waitFor(() => expect(sentTypes()).toEqual([["UNDO"]]));
    await vi.waitFor(() =>
      expect(screen.getByLabelText("Redo")).not.toHaveProperty(
        "disabled",
        true,
      ),
    );
    fireEvent.click(screen.getByLabelText("Redo"));
    await vi.waitFor(() =>
      expect(sentTypes()).toEqual([["UNDO"], ["ADD_STEP"]]),
    );
    quiet.mockRestore();
  });

  it("reads the creation once, not on every press", async () => {
    const reads = mountVersionless(() =>
      Promise.resolve([createRow({ "base-reducer": 2 })]),
    );
    await vi.waitFor(() => expect(reads.document).toBe(1));
    await act(() => new Promise((resolve) => setTimeout(resolve)));
    fireEvent.click(screen.getByLabelText("Undo"));
    await vi.waitFor(() => expect(sentTypes()).toEqual([["UNDO"]]));
    await vi.waitFor(() =>
      expect(screen.getByLabelText("Redo")).not.toHaveProperty(
        "disabled",
        true,
      ),
    );
    fireEvent.click(screen.getByLabelText("Redo"));
    await vi.waitFor(() =>
      expect(sentTypes()).toEqual([["UNDO"], ["ADD_STEP"]]),
    );
    expect(reads.document).toBe(1);
  });
});
