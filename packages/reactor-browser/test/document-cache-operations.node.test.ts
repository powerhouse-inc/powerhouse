import {
  ReactorBuilder,
  ReactorClientBuilder,
  type InProcessReactorClientModule,
} from "@powerhousedao/reactor";
import {
  setModelName,
  withSignaturePolicy,
  type DocumentModelModule,
} from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DocumentCache } from "../src/document-cache.js";

let module: InProcessReactorClientModule;
let cache: DocumentCache;

async function createModel(): Promise<string> {
  const document = withSignaturePolicy(
    documentModelDocumentModelModule.utils.createDocument(),
    "legacy",
  );
  await module.client.create(document);
  return document.header.id;
}

beforeEach(async () => {
  module = await new ReactorClientBuilder()
    .withReactorBuilder(
      new ReactorBuilder().withDocumentModelSources([
        documentModelDocumentModelModule as unknown as DocumentModelModule,
      ]),
    )
    .buildModule();
  cache = new DocumentCache(module.client);
});

afterEach(async () => {
  cache.dispose();
  await module.reactor.kill().completed;
});

describe("DocumentCache documents' operations", () => {
  it("serves an empty operation list for every scope of a new document", async () => {
    const id = await createModel();

    const document = await cache.get(id);

    expect(document.operations.global).toEqual([]);
    expect(document.operations.local).toEqual([]);
    expect(document.operations.document).toEqual([]);
  });

  it("serves no history with the document; the operation cache loads it", async () => {
    const id = await createModel();
    await module.client.execute(id, "main", [setModelName({ name: "A" })]);
    await module.client.execute(id, "main", [setModelName({ name: "B" })]);

    const document = await cache.get(id);
    expect(document.header.revision.global).toBe(2);
    expect(document.operations.global).toEqual([]);

    cache.loadOperations(id, "global", 10);
    await vi.waitFor(() =>
      expect(cache.getOperationsState(id, "global").status).toBe("success"),
    );
    expect(
      cache
        .getOperationsState(id, "global")
        .operations.map((operation) => operation.action.type),
    ).toEqual(["SET_MODEL_NAME", "SET_MODEL_NAME"]);
  });
});
