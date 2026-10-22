// @vitest-environment happy-dom
import type { IPackageManager, PHStore } from "@powerhousedao/reactor-browser";
import {
  bindPHStoreToWindow,
  createPHStore,
  DocumentCache,
  EditorDocumentProvider,
  PHStoreProvider,
  ReactorBuilder,
  ReactorClientBuilder,
  useDocumentById,
} from "@powerhousedao/reactor-browser";
import type { DocumentDriveDocument } from "@powerhousedao/shared/document-drive";
import {
  addFile,
  driveDocumentModelModule,
} from "@powerhousedao/shared/document-drive";
import type {
  Action,
  DocumentModelDocument,
  DocumentModelLib,
  PHDocument,
} from "@powerhousedao/shared/document-model";
import {
  generateId,
  setInitialState,
  setModelName,
  setStateSchema,
  withSignaturePolicy,
} from "@powerhousedao/shared/document-model";
import { act, cleanup, render, screen } from "@testing-library/react";
import { documentModelDocumentModelModule } from "document-model";
import { Suspense } from "react";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import Editor from "./editor.js";

// Long enough for a mount effect's dispatch to reach the reactor.
const SETTLE_MS = 1_000;

type ClientModule = Awaited<ReturnType<ReactorClientBuilder["buildModule"]>>;

let module: ClientModule;
let store: PHStore;

beforeAll(async () => {
  module = await new ReactorClientBuilder()
    .withReactorBuilder(
      new ReactorBuilder().withDocumentModelSources([
        driveDocumentModelModule,
        documentModelDocumentModelModule,
      ] as never),
    )
    .withCreateSignaturePolicy("legacy")
    .buildModule();
  store = createPHStore();
  bindPHStoreToWindow(store);
  store.reactorClient = module.client;
  store.vetraPackageManager = {
    packages: [
      { documentModels: [documentModelDocumentModelModule], editors: [] },
    ] as unknown as DocumentModelLib[],
    subscribe: () => () => {},
  } as unknown as IPackageManager;
});

afterAll(async () => {
  await module.reactor.kill().completed;
});

afterEach(() => {
  cleanup();
});

function legacy<TDocument extends PHDocument>(document: TDocument): TDocument {
  return withSignaturePolicy(document, "legacy", { id: generateId() });
}

/** A document model named `name` in a drive, after `actions`, selected. */
async function selectDocumentModel(
  name: string,
  actions: Action[],
): Promise<string> {
  const drive = await module.client.create<DocumentDriveDocument>(
    legacy(driveDocumentModelModule.utils.createDocument()),
  );
  const model = legacy(documentModelDocumentModelModule.utils.createDocument());
  model.header.name = name;
  const documentId = (await module.client.create(model)).header.id;
  if (actions.length > 0) {
    await module.client.execute(documentId, "main", actions);
  }
  const withFile = await module.client.execute<DocumentDriveDocument>(
    drive.header.id,
    "main",
    [
      addFile({
        id: documentId,
        name,
        documentType: "powerhouse/document-model",
      }),
    ],
  );

  const documentCache = new DocumentCache(module.client);
  // Connect loads the document before it opens the editor.
  await documentCache.get(documentId);
  store.documentCache = documentCache;
  store.drives = [withFile];
  store.selectedDriveId = drive.header.id;
  store.selectedNodeId = documentId;
  return documentId;
}

/** Hosts the editor the way Connect does: the document and its dispatch. */
function EditorHost({ documentId }: { documentId: string }) {
  const [document, dispatch] = useDocumentById(documentId);
  if (!document) return null;
  return (
    <EditorDocumentProvider document={document} dispatch={dispatch}>
      <Editor
        document={document as DocumentModelDocument}
        dispatch={dispatch}
      />
    </EditorDocumentProvider>
  );
}

async function openEditor(documentId: string): Promise<void> {
  // act flushes the retry of the editor's lazy parts once their imports land.
  await act(async () => {
    render(
      <PHStoreProvider store={store}>
        <Suspense>
          <EditorHost documentId={documentId} />
        </Suspense>
      </PHStoreProvider>,
    );
    await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
  });
  await screen.findByText("global state schema *");
  await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
}

async function getModel(documentId: string): Promise<DocumentModelDocument> {
  return module.client.get<DocumentModelDocument>(documentId);
}

const SCHEMA = `type SpecSheetState {
  title: String!
}`;

describe("document-model editor on open", { timeout: 30_000 }, () => {
  it("leaves a schema written without a model name alone", async () => {
    const documentId = await selectDocumentModel("Spec sheet", [
      setStateSchema({ scope: "global", schema: SCHEMA }),
      setInitialState({ scope: "global", initialValue: '{"title":"Spec"}' }),
    ]);
    const before = await getModel(documentId);

    await openEditor(documentId);

    const after = await getModel(documentId);
    expect(after.header.revision).toEqual(before.header.revision);
    expect(after.state.global.specifications[0].state.global.schema).toBe(
      SCHEMA,
    );
  });

  it("leaves an initial value that does not match the schema alone", async () => {
    const documentId = await selectDocumentModel("Spec sheet", [
      setModelName({ name: "Spec sheet" }),
      setStateSchema({ scope: "global", schema: SCHEMA }),
      setInitialState({ scope: "global", initialValue: "{}" }),
    ]);
    const before = await getModel(documentId);

    await openEditor(documentId);

    const after = await getModel(documentId);
    expect(after.header.revision).toEqual(before.header.revision);
    expect(after.state.global.specifications[0].state.global.initialValue).toBe(
      "{}",
    );
  });

  it("names a blank model after its document and gives it a schema", async () => {
    const documentId = await selectDocumentModel("Spec sheet", []);

    await openEditor(documentId);

    const after = await getModel(documentId);
    expect(after.state.global.name).toBe("Spec sheet");
    const { schema, initialValue } =
      after.state.global.specifications[0].state.global;
    expect(schema).toContain("type SpecSheetState");
    expect(JSON.parse(initialValue)).toEqual({ _placeholder: null });
    expect(screen.queryByText(/_placeholder is not defined/)).toBeNull();
  });
});
