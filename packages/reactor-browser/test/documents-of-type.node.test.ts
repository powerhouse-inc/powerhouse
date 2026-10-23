import {
  ReactorBuilder,
  ReactorClientBuilder,
  type InProcessReactorClientModule,
} from "@powerhousedao/reactor";
import {
  driveCreateDocument,
  driveDocumentModelModule,
} from "@powerhousedao/shared/document-drive";
import {
  withSignaturePolicy,
  type DocumentModelModule,
  type PHDocument,
} from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DocumentCache, readPromiseState } from "../src/document-cache.js";

const TYPE = documentModelDocumentModelModule.documentModel.global.id;

let module: InProcessReactorClientModule;
let cache: DocumentCache;

async function create(document: PHDocument): Promise<string> {
  const signed = withSignaturePolicy(document, "legacy");
  await module.client.create(signed);
  return signed.header.id;
}

const createModel = () =>
  create(documentModelDocumentModelModule.utils.createDocument());

const ids = () => [...cache.getDocumentsOfTypeState(TYPE, 2).ids].sort();

beforeEach(async () => {
  module = await new ReactorClientBuilder()
    .withReactorBuilder(
      new ReactorBuilder().withDocumentModelSources([
        driveDocumentModelModule as unknown as DocumentModelModule,
        documentModelDocumentModelModule as unknown as DocumentModelModule,
      ]),
    )
    .buildModule();
  cache = new DocumentCache(module.client);
});

afterEach(() => {
  cache.dispose();
  module.reactor.kill();
});

describe("DocumentCache documents of a type", () => {
  it("loads a page at a time, only the type's documents, into the document cache", async () => {
    const models = [
      await createModel(),
      await createModel(),
      await createModel(),
    ];
    await create(
      driveCreateDocument({ global: { name: "D", icon: null, nodes: [] } }),
    );

    await cache.loadDocumentsOfType(TYPE, 2);
    const first = cache.getDocumentsOfTypeState(TYPE, 2);
    expect(first).toMatchObject({ status: "success", hasNextPage: true });
    expect(first.ids).toHaveLength(2);
    // Primed, so reading one resolves without another fetch.
    expect(readPromiseState(cache.get(first.ids[0])).status).toBe("fulfilled");

    cache.loadMoreDocumentsOfType(TYPE, 2);
    await vi.waitFor(() =>
      expect(cache.getDocumentsOfTypeState(TYPE, 2)).toMatchObject({
        status: "success",
        hasNextPage: false,
      }),
    );
    expect(ids()).toEqual([...models].sort());
  });

  it("reloads the loaded pages when a document of the type is created or deleted", async () => {
    const first = await createModel();
    await cache.loadDocumentsOfType(TYPE, 2);
    const listener = vi.fn();
    cache.subscribeDocumentsOfType(TYPE, 2, listener);

    const second = await createModel();
    await vi.waitFor(() => expect(ids()).toEqual([first, second].sort()));
    expect(listener).toHaveBeenCalled();

    await module.client.deleteDocument(first);
    await vi.waitFor(() => expect(ids()).toEqual([second]));
  });

  it("keeps every loaded row when a document of the type is created", async () => {
    const models = [
      await createModel(),
      await createModel(),
      await createModel(),
    ];
    await cache.loadDocumentsOfType(TYPE, 2);
    // The creates' own events may still reload it; ask until page two is in.
    await vi.waitFor(() => {
      cache.loadMoreDocumentsOfType(TYPE, 2);
      expect(ids()).toHaveLength(3);
    });

    const added = await createModel();
    await vi.waitFor(() => expect(ids()).toEqual([...models, added].sort()));
  });

  it("keeps the first page's promise across reloads, so a reader doesn't suspend again", async () => {
    await createModel();
    const firstPage = cache.loadDocumentsOfType(TYPE, 2);
    await firstPage;
    await createModel();
    await vi.waitFor(() => expect(ids()).toHaveLength(2));
    expect(cache.loadDocumentsOfType(TYPE, 2)).toBe(firstPage);
  });
});
