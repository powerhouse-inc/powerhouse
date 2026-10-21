import type { IDocumentCache } from "@powerhousedao/reactor-browser";
import {
  createPHStore,
  PHStoreProvider,
  useSelectedDocument,
} from "@powerhousedao/reactor-browser";
import type {
  EditorModule,
  EditorProps,
  PHDocument,
} from "@powerhousedao/shared/document-model";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EditorContainer } from "./EditorContainer.js";

// setupTests mocks reactor-browser; this host test runs the real hooks.
vi.mock("@powerhousedao/reactor-browser", async (importOriginal) =>
  importOriginal(),
);

const TYPE = "powerhouse/package";
const pkg = {
  header: { id: "package-id", name: "My package", documentType: TYPE },
} as unknown as PHDocument;

// A settled promise per document, so `use` reads it without suspending.
function cacheOf(documents: PHDocument[]): IDocumentCache {
  const settled = new Map(
    documents.map((document) => [
      document.header.id,
      Object.assign(Promise.resolve(document), {
        status: "fulfilled",
        value: document,
      }),
    ]),
  );
  return {
    get: (id: string) => settled.get(id),
    getBatch: () => Promise.resolve(documents),
    subscribe: () => () => {},
  } as unknown as IDocumentCache;
}

function Inner() {
  const [document] = useSelectedDocument();
  return <span data-testid="inner">{document.header.id}</span>;
}

function PackageEditor({ document, dispatch }: EditorProps<PHDocument>) {
  return (
    <p data-testid="editor">
      {document.header.name}:{typeof dispatch}
      <Inner />
    </p>
  );
}

const editorModule: EditorModule = {
  Component: PackageEditor,
  documentTypes: [TYPE],
  config: { id: "vetra-package-editor", name: "Package editor" },
};

function renderContainer(documents: PHDocument[], documentId: string) {
  const store = createPHStore({
    documentCache: cacheOf(documents),
    vetraPackageManager: {
      packages: [{ editors: [editorModule] }],
      subscribe: () => () => {},
    } as never,
  });
  return render(
    <PHStoreProvider store={store}>
      <EditorContainer documentId={documentId} />
    </PHStoreProvider>,
  );
}

describe("Vetra's EditorContainer", () => {
  it("gives the package editor its document as props and to its hooks", async () => {
    renderContainer([pkg], pkg.header.id);
    expect((await screen.findByTestId("editor")).textContent).toBe(
      "My package:functionpackage-id",
    );
    expect(screen.getByTestId("inner").textContent).toBe("package-id");
  });

  it("says so when the document is missing", async () => {
    renderContainer([], "missing-id");
    expect((await screen.findByRole("alert")).textContent).toContain(
      "missing-id",
    );
  });
});
