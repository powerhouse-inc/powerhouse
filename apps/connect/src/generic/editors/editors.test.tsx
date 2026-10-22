// @vitest-environment happy-dom

import type { UseUndoRedoShortcutsProps } from "@powerhousedao/connect/hooks";
import type { Action, PHDocument } from "@powerhousedao/shared/document-model";
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  document: undefined as unknown,
  dispatch: (() => undefined) as (action: unknown) => void,
  clientUndoRedo: undefined as unknown,
  hookDocuments: [] as unknown[],
  shortcuts: undefined as UseUndoRedoShortcutsProps | undefined,
}));

vi.mock("./editor-loader.js", () => ({
  EditorLoader: () => null,
}));
vi.mock("@powerhousedao/connect/hooks", () => ({
  useUndoRedoShortcuts: (props: UseUndoRedoShortcutsProps) => {
    state.shortcuts = props;
  },
}));
vi.mock("@powerhousedao/connect/services", () => ({
  dismissToast: () => undefined,
  toast: () => undefined,
}));
vi.mock("@powerhousedao/design-system", () => ({
  Icon: () => null,
  PowerhouseButton: (props: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props} />
  ),
}));
vi.mock("@powerhousedao/design-system/connect", () => ({
  RevisionHistory: () => null,
  useBaseReducer3UndoRedo: (document: unknown) => {
    state.hookDocuments.push(document);
    return state.clientUndoRedo;
  },
}));
vi.mock("@powerhousedao/reactor-browser", () => ({
  getRevisionFromDate: () => 0,
  setRevisionHistoryVisible: () => undefined,
  openTarget: () => undefined,
  useDocumentById: () => [state.document, state.dispatch],
  useDocumentModelModuleById: () => undefined,
  useDocumentOperations: () => ({
    operations: [],
    isLoading: false,
    hasNextPage: false,
    fetchNextPage: () => undefined,
    error: undefined,
  }),
  useDocumentVersionStatus: () => undefined,
  useEditorModuleFor: () => undefined,
  useFallbackEditorModule: () => undefined,
  useRevisionHistoryVisible: () => false,
  useSelectedTimelineItem: () => undefined,
  useVetraPackageManager: () => undefined,
  useVetraPackages: () => [],
}));
vi.mock("@powerhousedao/connect/components/shared", () => ({
  CenteredErrorMessage: () => null,
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("./document-upgrade-toast.js", () => ({
  DocumentUpgradeToast: () => null,
}));
vi.mock("./revision-history-view.js", () => ({
  GenericRevisionHistory: () => null,
}));

const { DocumentEditor } = await import("./editors.js");

function makeDocument(options: {
  global?: number;
  local?: number;
  clipboard?: number;
}): PHDocument {
  return {
    header: {
      id: "doc-1",
      documentType: "powerhouse/test",
      revision: { global: options.global ?? 0, local: options.local ?? 0 },
      meta: {},
    },
    clipboard: Array.from({ length: options.clipboard ?? 0 }, () => ({})),
  } as unknown as PHDocument;
}

function renderEditor(document: PHDocument): UseUndoRedoShortcutsProps {
  state.document = document;
  render(<DocumentEditor document={document} />);
  if (!state.shortcuts) throw new Error("useUndoRedoShortcuts was not called");
  return state.shortcuts;
}

describe("DocumentEditor undo and redo", () => {
  let dispatch: ReturnType<typeof vi.fn<(action: unknown) => void>>;

  beforeEach(() => {
    dispatch = vi.fn<(action: unknown) => void>();
    state.dispatch = dispatch;
    state.clientUndoRedo = undefined;
    state.hookDocuments = [];
    state.shortcuts = undefined;
  });

  afterEach(cleanup);

  describe("without base-reducer 3", () => {
    it("reads revisions and the clipboard and dispatches UNDO and REDO", () => {
      const shortcuts = renderEditor(
        makeDocument({ global: 0, local: 2, clipboard: 1 }),
      );

      expect(shortcuts.canUndo).toBe(true);
      expect(shortcuts.canRedo).toBe(true);

      shortcuts.undo();
      shortcuts.redo();
      const dispatched = dispatch.mock.calls.map(
        ([action]) => action as Action,
      );
      expect(dispatched.map((action) => action.type)).toEqual(["UNDO", "REDO"]);
      expect(dispatched.map((action) => action.scope)).toEqual([
        "global",
        "global",
      ]);
    });

    it("cannot undo without revisions or redo without a clipboard", () => {
      const shortcuts = renderEditor(makeDocument({}));

      expect(shortcuts.canUndo).toBe(false);
      expect(shortcuts.canRedo).toBe(false);
    });
  });

  describe("on base-reducer 3", () => {
    it("takes availability and both actions from the client", () => {
      const client = {
        canUndo: false,
        canRedo: true,
        undo: vi.fn(),
        redo: vi.fn(),
      };
      state.clientUndoRedo = client;
      const document = makeDocument({ global: 3 });
      const shortcuts = renderEditor(document);

      expect(state.hookDocuments.at(-1)).toBe(document);
      expect(shortcuts.canUndo).toBe(false);
      expect(shortcuts.canRedo).toBe(true);

      shortcuts.undo();
      shortcuts.redo();
      expect(client.undo).toHaveBeenCalledOnce();
      expect(client.redo).toHaveBeenCalledOnce();
      expect(dispatch).not.toHaveBeenCalled();
    });

    // The hook's "none" route: no client, and a dispatched UNDO is refused.
    it("never falls back to dispatching UNDO or REDO when the hook disables them", () => {
      state.clientUndoRedo = {
        canUndo: false,
        canRedo: false,
        undo: () => undefined,
        redo: () => undefined,
      };
      const shortcuts = renderEditor(
        makeDocument({ global: 3, local: 1, clipboard: 1 }),
      );

      expect(shortcuts.canUndo).toBe(false);
      expect(shortcuts.canRedo).toBe(false);
      shortcuts.undo();
      shortcuts.redo();
      expect(dispatch).not.toHaveBeenCalled();
    });
  });
});
