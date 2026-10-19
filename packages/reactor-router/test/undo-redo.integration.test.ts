import {
  ReactorBuilder,
  ReactorClientBuilder,
  type InProcessReactorClientModule,
} from "@powerhousedao/reactor";
import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import {
  type DocumentModelModule,
  type PHDocument,
} from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createRoutingClient,
  fromReactorClient,
  UnsupportedByBackendError,
  type RoutableBackendConfig,
  type RoutingReactorClient,
} from "../src/index.js";
import { memoryInfo } from "./stubs.js";

const DOCUMENT_MODEL = "powerhouse/document-model";

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

function baseReducer(document: PHDocument): number | undefined {
  return document.header.protocolVersions?.["base-reducer"];
}

function modelName(document: PHDocument): string {
  return (document.state as unknown as { global: { name: string } }).global
    .name;
}

describe("router undo and redo", () => {
  let module: InProcessReactorClientModule;
  let client: RoutingReactorClient;
  let drive = "";

  beforeAll(async () => {
    module = await inProcessReactor(
      documentModelDocumentModelModule as unknown as DocumentModelModule,
    );
    client = await createRoutingClient([config("one", module)], {
      onDiagnostic: () => {},
    });
    drive = (await module.client.drives.create({ global: { name: "Drive" } }))
      .header.id;
  });

  afterAll(async () => {
    await module.reactor.kill().completed;
  });

  it("forwards to the owning backend's client", async () => {
    const created = await client.createEmpty(DOCUMENT_MODEL, {
      parentIdentifier: drive,
    });
    const id = created.header.id;
    expect(baseReducer(created)).toBe(3);
    await client.execute(id, "main", [
      documentModelDocumentModelModule.actions.setModelName({ name: "first" }),
    ]);

    expect(await client.undoRedoAvailability(id)).toEqual({
      canUndo: true,
      canRedo: false,
    });
    expect(modelName(await client.undo(id))).toBe("");
    expect(await client.undoRedoAvailability(id)).toEqual({
      canUndo: false,
      canRedo: true,
    });
    expect(modelName(await client.redo(id))).toBe("first");
  });

  it("refuses a backend that does not declare them, sending nothing", async () => {
    const created = await client.createEmpty(DOCUMENT_MODEL, {
      parentIdentifier: drive,
    });
    const bare = {
      ...fromReactorClient(module.client),
      undo: undefined,
      redo: undefined,
      undoRedoAvailability: undefined,
    };
    const router = await createRoutingClient([config("bare", module, bare)], {
      onDiagnostic: () => {},
    });

    await expect(router.undo(created.header.id)).rejects.toBeInstanceOf(
      UnsupportedByBackendError,
    );
    await expect(router.redo(created.header.id)).rejects.toBeInstanceOf(
      UnsupportedByBackendError,
    );
    await expect(
      router.undoRedoAvailability(created.header.id),
    ).rejects.toBeInstanceOf(UnsupportedByBackendError);
  });
});
