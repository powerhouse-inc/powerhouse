import type { DocumentDriveDocument } from "@powerhousedao/shared/document-drive";
import type { PHDocument } from "@powerhousedao/shared/document-model";
import type { DocumentModelModule } from "document-model";
import type { PropsWithChildren } from "react";
import { describe, expect, it } from "vitest";
import { renderHook } from "vitest-browser-react";
import { createPHStore, PHStoreProvider } from "../src/hooks/ph-store.js";
import { useSelectedDocumentOfType } from "../src/hooks/selected-document.js";
import type { IDocumentCache } from "../src/types/documents.js";
import { driveNodesCacheOf } from "./utils/drive-nodes.js";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const DOC_ID = "11111111-2222-4333-8444-555555555555";
const TYPE = "test/doc";

const document = {
  header: { id: DOC_ID, name: "One", documentType: TYPE },
} as unknown as PHDocument;

const drive = {
  header: { id: "a-id", slug: "a", name: "a" },
  state: {
    global: {
      name: "a",
      nodes: [
        {
          id: DOC_ID,
          name: "One",
          kind: "file",
          documentType: TYPE,
          parentFolder: null,
        },
      ],
    },
  },
} as unknown as DocumentDriveDocument;

// A settled promise, so `use` reads it without suspending.
const settled = Object.assign(Promise.resolve(document), {
  status: "fulfilled",
  value: document,
});

const documentCache: IDocumentCache = {
  get: () => settled,
  getBatch: () => Promise.resolve([document]),
  subscribe: () => () => {},
};

const module = {
  documentModel: { global: { id: TYPE } },
  version: 1,
} as unknown as DocumentModelModule;

describe("useSelectedDocumentOfType", () => {
  it("keeps the hook order when the document type arrives later", async () => {
    const store = createPHStore({
      drives: [drive],
      driveNodes: driveNodesCacheOf(drive),
      selectedDriveId: "a-id",
      selectedNodeId: DOC_ID,
      documentCache,
      vetraPackageManager: {
        packages: [{ documentModels: [module] }],
        subscribe: () => () => {},
      } as never,
    });
    const { result, rerender } = await renderHook(
      (props?: { type: string | null }) =>
        // The overloads split null from string; this hook sees both.
        useSelectedDocumentOfType(props?.type as string),
      {
        initialProps: { type: null } as { type: string | null },
        wrapper: ({ children }: PropsWithChildren) => (
          <PHStoreProvider store={store}>{children}</PHStoreProvider>
        ),
      },
    );
    expect(result.current).toEqual([]);

    await rerender({ type: TYPE });
    expect(result.current[0]).toBe(document);

    await rerender({ type: null });
    expect(result.current).toEqual([]);
  });
});
