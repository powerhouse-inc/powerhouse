import type {
  DocumentDriveDocument,
  FolderNode,
  Node,
} from "@powerhousedao/shared/document-drive";
import type {
  DocumentDispatch,
  PHDocument,
} from "@powerhousedao/shared/document-model";
import type { DocumentModelModule } from "document-model";
import type { PropsWithChildren, ReactNode } from "react";
import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, renderHook } from "vitest-browser-react";
import { useDispatch } from "../src/hooks/dispatch.js";
import { DriveProvider } from "../src/hooks/drive-context.js";
import { EditorDocumentProvider } from "../src/hooks/editor-context.js";
import { createPHStore, PHStoreProvider } from "../src/hooks/ph-store.js";
import {
  useSelectedDocument,
  useSelectedDocumentId,
  useSelectedDocumentOfType,
} from "../src/hooks/selected-document.js";
import {
  useSelectedDrive,
  useSelectedDriveId,
} from "../src/hooks/selected-drive.js";
import { useSelectedFolder } from "../src/hooks/selected-folder.js";
import {
  useNodeTarget,
  usePreloadNode,
  useSelectedNode,
  useSetSelectedNode,
} from "../src/hooks/selected-node.js";
import type { IDocumentCache } from "../src/types/documents.js";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const TYPE = "test/doc";
const FILE_ID = "11111111-2222-4333-8444-555555555555";
const FOLDER_ID = "66666666-7777-4888-9999-000000000000";

function makeDocument(id: string, name: string, documentType = TYPE) {
  return {
    header: { id, name, documentType },
    state: {},
  } as unknown as PHDocument;
}

function makeDrive(slug: string) {
  return {
    header: { id: `${slug}-id`, slug, name: slug },
    state: {
      global: {
        name: slug,
        nodes: [
          {
            id: FILE_ID,
            name: "One",
            kind: "file",
            documentType: TYPE,
            parentFolder: FOLDER_ID,
          },
          { id: FOLDER_ID, name: "Inbox", kind: "folder", parentFolder: null },
        ],
      },
    },
  } as unknown as DocumentDriveDocument;
}

const appDrive = makeDrive("app");
const appDocument = makeDocument(FILE_ID, "App's");
const settled = Object.assign(Promise.resolve(appDocument), {
  status: "fulfilled",
  value: appDocument,
});
const documentCache: IDocumentCache = {
  get: () => settled,
  getBatch: () => Promise.resolve([appDocument]),
  subscribe: () => () => {},
};
const module = {
  documentModel: { global: { id: TYPE } },
  version: 1,
} as unknown as DocumentModelModule;

// The app's own selection: another drive and document than the contexts'.
function appStore() {
  return createPHStore({
    drives: [appDrive],
    selectedDriveId: appDrive.header.id,
    selectedNodeId: FILE_ID,
    documentCache,
    vetraPackageManager: {
      packages: [{ documentModels: [module] }],
      subscribe: () => () => {},
    } as never,
  });
}

function AppStore({ children }: PropsWithChildren) {
  return <PHStoreProvider store={appStore()}>{children}</PHStoreProvider>;
}

const noDispatch: DocumentDispatch = () => {};

describe("EditorDocumentProvider", () => {
  it("gives the hooks inside an editor its document, though no drive has it", async () => {
    const unlisted = makeDocument("unlisted-id", "Unlisted");
    const dispatch = vi.fn<DocumentDispatch>();
    const { result } = await renderHook(
      () => ({
        id: useSelectedDocumentId(),
        selected: useSelectedDocument(),
        ofType: useSelectedDocumentOfType(TYPE),
      }),
      {
        wrapper: ({ children }: PropsWithChildren) => (
          <AppStore>
            <EditorDocumentProvider document={unlisted} dispatch={dispatch}>
              {children}
            </EditorDocumentProvider>
          </AppStore>
        ),
      },
    );
    expect(result.current.id).toBe("unlisted-id");
    expect(result.current.selected[0]).toBe(unlisted);
    expect(result.current.ofType[0]).toBe(unlisted);
    result.current.ofType[1]({
      type: "X",
      input: {},
      scope: "global",
    } as never);
    expect(dispatch).toHaveBeenCalledOnce();
  });

  it("reads the app's selection without a provider", async () => {
    const { result } = await renderHook(() => useSelectedDocument(), {
      wrapper: AppStore,
    });
    expect(result.current[0]).toBe(appDocument);
  });

  it("checks the editor's document type", async () => {
    const other = makeDocument("other-id", "Other", "other/doc");
    await expect(
      renderHook(() => useSelectedDocumentOfType(TYPE), {
        wrapper: ({ children }: PropsWithChildren) => (
          <AppStore>
            <EditorDocumentProvider document={other} dispatch={noDispatch}>
              {children}
            </EditorDocumentProvider>
          </AppStore>
        ),
      }),
    ).rejects.toThrow(/other\/doc/);
  });

  it("gives an editor inside another editor its own document", async () => {
    const outer = makeDocument("outer-id", "Outer");
    const inner = makeDocument("inner-id", "Inner");
    function Name({ testId }: { testId: string }) {
      const [document] = useSelectedDocument();
      return <p data-testid={testId}>{document.header.name}</p>;
    }
    const screen = await render(
      <AppStore>
        <EditorDocumentProvider document={outer} dispatch={noDispatch}>
          <Name testId="outer" />
          <EditorDocumentProvider document={inner} dispatch={noDispatch}>
            <Name testId="inner" />
          </EditorDocumentProvider>
        </EditorDocumentProvider>
      </AppStore>,
    );
    await expect
      .element(screen.getByTestId("outer"))
      .toHaveTextContent("Outer");
    await expect
      .element(screen.getByTestId("inner"))
      .toHaveTextContent("Inner");
  });
});

describe("DriveProvider", () => {
  const drive = makeDrive("mine");
  const folder = drive.state.global.nodes.find(
    (n): n is FolderNode => n.id === FOLDER_ID,
  )!;
  const file = drive.state.global.nodes.find((n) => n.id === FILE_ID)!;

  function withDrive(
    value: Partial<Parameters<typeof DriveProvider>[0]["value"]>,
  ) {
    return function Wrapper({ children }: { children?: ReactNode }) {
      return (
        <AppStore>
          <DriveProvider value={{ drive, dispatch: noDispatch, ...value }}>
            {children}
          </DriveProvider>
        </AppStore>
      );
    };
  }

  it("gives a drive app its drive, folder and node, not the app's", async () => {
    const { result } = await renderHook(
      () => ({
        driveId: useSelectedDriveId(),
        drive: useSelectedDrive()[0],
        node: useSelectedNode(),
        folder: useSelectedFolder(),
      }),
      { wrapper: withDrive({ folder, nodeId: FOLDER_ID }) },
    );
    expect(result.current.driveId).toBe(drive.header.id);
    expect(result.current.drive).toBe(drive);
    expect(result.current.node?.id).toBe(FOLDER_ID);
    expect(result.current.folder).toBe(folder);
  });

  it("opens and preloads nodes through the host's open and preload", async () => {
    const open = vi.fn<(node: Node | undefined) => void>();
    const preload = vi.fn<(node: Node | undefined) => void>();
    const { result } = await renderHook(
      () => ({
        setSelectedNode: useSetSelectedNode(),
        preloadNode: usePreloadNode(),
        target: useNodeTarget(file),
      }),
      { wrapper: withDrive({ open, preload }) },
    );
    act(() => result.current.setSelectedNode(`one-${FILE_ID}`));
    expect(open).toHaveBeenCalledWith(file, undefined);
    act(() => result.current.preloadNode(folder));
    expect(preload).toHaveBeenCalledWith(folder);
    // Links point into the drive app's drive.
    expect(result.current.target).toEqual({
      driveSlug: "mine",
      nodeSlug: `one-${FILE_ID}`,
    });
  });
});

describe("useDispatch", () => {
  it("keeps its dispatch while the document's id stays the same", async () => {
    const first = makeDocument("a", "First");
    const { result, rerender } = await renderHook(
      (props?: { document: PHDocument }) => useDispatch(props?.document)[1],
      { initialProps: { document: first } },
    );
    const dispatch = result.current;
    await rerender({ document: makeDocument("a", "Renamed") });
    expect(result.current).toBe(dispatch);
    await rerender({ document: makeDocument("b", "Other") });
    expect(result.current).not.toBe(dispatch);
  });
});
