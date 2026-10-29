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
  type IRoutableBackend,
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
      new ReactorBuilder()
        .withDocumentModelSources([
          driveDocumentModelModule as unknown as DocumentModelModule,
          model,
        ])
        // base-reducer 3 needs undoV3, which is off by default.
        .withExecutorConfig({ featureFlags: { undoV3: true } }),
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
    expect(baseReducer(await module.client.get(id))).toBe(3);
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
    // Without a write half: a backend with one always has undo.
    const bare = {
      ...fromReactorClient(module.client),
      write: undefined,
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

const UNDO_MEMBERS = ["undo", "redo", "undoRedoAvailability"];
const HALF_WRITES = [
  ...UNDO_MEMBERS,
  "create",
  "execute",
  "executeBatch",
  "loadBatch",
  "deleteDocument",
];
const WRITE_MEMBERS = [
  ...HALF_WRITES,
  ...HALF_WRITES.map((member) => `write.${member}`),
  "submit.execute",
  "submit.create",
];

/** Records every member the router calls, by name. */
function recorded(backend: IRoutableBackend): {
  backend: IRoutableBackend;
  calls: string[];
} {
  const calls: string[] = [];
  const wrap = (prefix: string, target: object): Record<string, unknown> =>
    Object.fromEntries(
      Object.entries(target).map(([key, value]) => [
        key,
        typeof value === "function"
          ? (...args: unknown[]) => {
              calls.push(`${prefix}${key}`);
              return (value as (...a: unknown[]) => unknown)(...args);
            }
          : value,
      ]),
    );
  const wrapped = wrap("", backend);
  if (backend.submit) {
    wrapped.submit = wrap("submit.", backend.submit);
  }
  const write = backend.write;
  if (write) {
    // A class instance: its methods are on the prototype.
    wrapped.write = new Proxy(write, {
      get: (target, key, receiver) => {
        const value = Reflect.get(target, key, receiver) as unknown;
        if (typeof key !== "string" || typeof value !== "function") {
          return value;
        }
        return (...args: unknown[]) => {
          calls.push(`write.${key}`);
          return (value as (...a: unknown[]) => unknown).apply(target, args);
        };
      },
    });
  }
  return { backend: wrapped as unknown as IRoutableBackend, calls };
}

function writes(calls: readonly string[]): string[] {
  return calls.filter((call) => WRITE_MEMBERS.includes(call));
}

describe("router undo and redo across two backends", () => {
  let primary: InProcessReactorClientModule;
  let owner: InProcessReactorClientModule;
  let drive = "";

  beforeAll(async () => {
    const model =
      documentModelDocumentModelModule as unknown as DocumentModelModule;
    primary = await inProcessReactor(model);
    owner = await inProcessReactor(model);
    drive = (await owner.client.drives.create({ global: { name: "Owned" } }))
      .header.id;
  });

  afterAll(async () => {
    await primary.reactor.kill().completed;
    await owner.reactor.kill().completed;
  });

  async function ownedDocument(): Promise<string> {
    const created = await owner.client.createEmpty(DOCUMENT_MODEL, {
      parentIdentifier: drive,
    });
    expect(baseReducer(created)).toBe(3);
    expect(baseReducer(await owner.client.get(created.header.id))).toBe(3);
    await owner.client.execute(created.header.id, "main", [
      documentModelDocumentModelModule.actions.setModelName({ name: "first" }),
    ]);
    return created.header.id;
  }

  it("sends undo, redo and availability to the backend that owns the document, and nothing to the other", async () => {
    const id = await ownedDocument();
    const one = recorded(fromReactorClient(primary.client));
    const two = recorded(fromReactorClient(owner.client));
    const client = await createRoutingClient(
      [config("one", primary, one.backend), config("two", owner, two.backend)],
      { onDiagnostic: () => {} },
    );

    expect(await client.undoRedoAvailability(id)).toEqual({
      canUndo: true,
      canRedo: false,
    });
    expect(modelName(await client.undo(id))).toBe("");
    expect(modelName(await client.redo(id))).toBe("first");

    expect(writes(two.calls)).toEqual([
      "write.undoRedoAvailability",
      "write.undo",
      "write.redo",
    ]);
    expect(writes(one.calls)).toEqual([]);
    expect(modelName(await owner.client.get(id))).toBe("first");
    await expect(primary.client.get(id)).rejects.toThrow();
  });

  it("refuses an owner that does not declare them, submitting and executing nothing", async () => {
    const id = await ownedDocument();
    const before = await owner.client.getOperations(id);
    const one = recorded(fromReactorClient(primary.client));
    const two = recorded({
      ...fromReactorClient(owner.client),
      write: undefined,
      undo: undefined,
      redo: undefined,
      undoRedoAvailability: undefined,
    });
    const client = await createRoutingClient(
      [config("one", primary, one.backend), config("two", owner, two.backend)],
      { onDiagnostic: () => {} },
    );

    await expect(client.undo(id)).rejects.toBeInstanceOf(
      UnsupportedByBackendError,
    );
    await expect(client.redo(id)).rejects.toBeInstanceOf(
      UnsupportedByBackendError,
    );
    await expect(client.undoRedoAvailability(id)).rejects.toBeInstanceOf(
      UnsupportedByBackendError,
    );

    expect(writes(one.calls)).toEqual([]);
    expect(writes(two.calls)).toEqual([]);
    const after = await owner.client.getOperations(id);
    expect(after).toEqual(before);
    expect(modelName(await owner.client.get(id))).toBe("first");
  });
});
