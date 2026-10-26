import {
  ReactorBuilder,
  ReactorClientBuilder,
  type InProcessReactorClientModule,
  type JobInfo,
  type WriteHandle,
} from "@powerhousedao/reactor";
import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import {
  createPresignedHeader,
  type DocumentModelModule,
  type PHDocument,
  type Reducer,
} from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  createRoutingClient,
  fromReactorClient,
  type RoutableBackendConfig,
  type RoutingReactorClient,
} from "../src/index.js";
import { memoryInfo } from "./stubs.js";

const DOCUMENT_MODEL = "powerhouse/document-model";

function untaggedDocumentModel(): DocumentModelModule {
  const tagged = documentModelDocumentModelModule.reducer as unknown as Reducer;
  const reducer: Reducer = (...args) => tagged(...args);
  return {
    ...(documentModelDocumentModelModule as unknown as DocumentModelModule),
    reducer,
  };
}

async function inProcessReactor(
  model: DocumentModelModule,
): Promise<InProcessReactorClientModule> {
  return new ReactorClientBuilder()
    .withReactorBuilder(
      new ReactorBuilder().withDocumentModelSources([
        driveDocumentModelModule as unknown as DocumentModelModule,
        model,
      ]),
    )
    .withCreateSignaturePolicy("legacy")
    .buildModule();
}

function config(
  name: string,
  module: InProcessReactorClientModule,
  backend = fromReactorClient(module.client),
): RoutableBackendConfig {
  return {
    name,
    backend,
    facts: memoryInfo(),
    reach: { hosting: "in-process", inspection: "direct" },
    refusesMisroutes: false,
  };
}

function unversioned(): PHDocument {
  const document = documentModelDocumentModelModule.utils.createDocument();
  return {
    ...document,
    header: createPresignedHeader(undefined, DOCUMENT_MODEL),
  } as PHDocument;
}

function baseReducer(document: PHDocument): number | undefined {
  return document.header.protocolVersions?.["base-reducer"];
}

describe("router creates of a model whose reducer createReducer did not build", () => {
  let untagged: InProcessReactorClientModule;
  let tagged: InProcessReactorClientModule;
  let client: RoutingReactorClient;
  let untaggedDrive = "";
  let taggedDrive = "";

  beforeAll(async () => {
    untagged = await inProcessReactor(untaggedDocumentModel());
    tagged = await inProcessReactor(
      documentModelDocumentModelModule as unknown as DocumentModelModule,
    );
    client = await createRoutingClient(
      [config("untagged", untagged), config("tagged", tagged)],
      { onDiagnostic: () => {} },
    );
    untaggedDrive = (
      await untagged.client.drives.create({ global: { name: "Untagged" } })
    ).header.id;
    taggedDrive = (
      await tagged.client.drives.create({ global: { name: "Tagged" } })
    ).header.id;
  });

  afterAll(async () => {
    await untagged.reactor.kill().completed;
    await tagged.reactor.kill().completed;
  });

  it("asks the parent's backend with the document type", async () => {
    expect(
      await client.getCreateProtocolVersions({
        documentType: DOCUMENT_MODEL,
        parentIdentifier: untaggedDrive,
      }),
    ).toEqual({ "base-reducer": 2 });
    expect(
      await client.getCreateProtocolVersions({
        documentType: DOCUMENT_MODEL,
        parentIdentifier: taggedDrive,
      }),
    ).toEqual({ "base-reducer": 3 });
  });

  it("lands createEmpty at base-reducer 2", async () => {
    const created = await client.createEmpty(DOCUMENT_MODEL, {
      parentIdentifier: untaggedDrive,
    });

    expect(baseReducer(created)).toBe(2);
    expect(baseReducer(await untagged.client.get(created.header.id))).toBe(2);
  });

  it("lands a headerless createAsync at base-reducer 2 on a backend without submit", async () => {
    const { submit: _submit, ...waiting } = fromReactorClient(untagged.client);
    const router = await createRoutingClient(
      [config("untagged", untagged, waiting)],
      { onDiagnostic: () => {} },
    );
    const document = unversioned();

    const result = await router.createAsync(document, untaggedDrive);

    expect(result.jobs.create.status).toBe("READ_READY");
    expect(baseReducer(await untagged.client.get(document.header.id))).toBe(2);
  });

  it("resolves a headerless createAsync on a backend without submit, not a fixed default", async () => {
    const { submit: _submit, ...waiting } = fromReactorClient(tagged.client);
    const router = await createRoutingClient(
      [config("tagged", tagged, waiting)],
      { onDiagnostic: () => {} },
    );
    const document = unversioned();

    await router.createAsync(document, taggedDrive);

    expect(baseReducer(await tagged.client.get(document.header.id))).toBe(3);
  });

  it("lands a headerless createAsync at base-reducer 2 through submit", async () => {
    const document = unversioned();

    const result = await client.createAsync(document, untaggedDrive);
    await client.waitForJob(result.jobs.create);

    expect(baseReducer(await untagged.client.get(document.header.id))).toBe(2);
  });

  it("keeps base-reducer 3 for a createReducer model", async () => {
    const created = await client.createEmpty(DOCUMENT_MODEL, {
      parentIdentifier: taggedDrive,
    });

    expect(baseReducer(created)).toBe(3);
  });
});

describe("router copyNode", () => {
  it("forwards the options to the drive's backend", async () => {
    const module = await inProcessReactor(
      documentModelDocumentModelModule as unknown as DocumentModelModule,
    );
    try {
      const client = await createRoutingClient([config("one", module)], {
        onDiagnostic: () => {},
      });
      const drive = await module.client.drives.create({
        global: { name: "Drive" },
      });
      const receipt = {
        job: {} as JobInfo,
        token: { version: 1 as const, createdAtUtcIso: "", coordinates: [] },
        documentId: drive.header.id,
        branch: "main",
      };
      const handle: WriteHandle = {
        jobId: "",
        documentId: drive.header.id,
        branch: "main",
        written: Promise.resolve(receipt),
        readable: Promise.resolve(receipt),
        document: <T extends PHDocument>() =>
          Promise.resolve(drive as unknown as T),
      };
      const copy = vi
        .spyOn(module.client.write.drives, "copyNode")
        .mockResolvedValue(handle);
      const signal = new AbortController().signal;
      const options = { protocolVersions: { "base-reducer": 3 } };

      await client.drives.copyNode(
        drive.header.id,
        "node",
        "folder",
        signal,
        options,
      );

      expect(copy).toHaveBeenCalledWith(
        drive.header.id,
        "node",
        "folder",
        signal,
        options,
      );
    } finally {
      await module.reactor.kill().completed;
    }
  });
});
