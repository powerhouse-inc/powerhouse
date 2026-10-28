import { setDriveName } from "@powerhousedao/shared/document-drive";
import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import { generateId } from "@powerhousedao/shared/document-model";
import type { DocumentModelModule } from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkStoredProtocols } from "../../src/core/stored-protocol-check.js";
import { storedModelRefusals } from "../../src/core/stored-protocol-check.js";
import { UnsupportedStoredProtocolError } from "../../src/shared/errors.js";
import {
  countDocumentsCreatedWith,
  storedProtocolVersions,
} from "../../src/storage/kysely/stored-protocol-versions.js";
import type { KyselyOperationStore } from "../../src/storage/kysely/store.js";
import type { Database as DatabaseSchema } from "../../src/storage/kysely/types.js";
import {
  createCreateDocumentOperation,
  createMockLogger,
  createTestOperationStore,
  createTestOperationStorePostgres,
} from "../factories.js";

const DRIVE = "powerhouse/document-drive";
const NARROW = { "base-reducer": [1, 2] };
const WIDE = { "base-reducer": [1, 2, 3] };
const MODEL = "powerhouse/document-model";
const LAZY = "test/lazy";
const untaggedModel = {
  ...(documentModelDocumentModelModule as unknown as DocumentModelModule),
  reducer: ((...args: unknown[]) =>
    (documentModelDocumentModelModule.reducer as (...a: unknown[]) => unknown)(
      ...args,
    )) as never,
} as DocumentModelModule;

describe.each([
  {
    name: "PGlite",
    create: async () => {
      const setup = await createTestOperationStore();
      const dispose = async () => {
        await setup.baseDb.destroy();
        await setup.cleanup();
      };
      return { ...setup, dispose };
    },
  },
  {
    name: "Postgres",
    create: async () => {
      const setup = await createTestOperationStorePostgres();
      return { ...setup, dispose: setup.cleanup };
    },
  },
])("stored protocol versions [$name]", ({ create }) => {
  let baseDb: Kysely<DatabaseSchema>;
  let schema: string;
  let store: KyselyOperationStore;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    const setup = await create();
    baseDb = setup.baseDb;
    schema = setup.schema;
    store = setup.store;
    cleanup = setup.dispose;
  });

  afterEach(async () => {
    await cleanup();
  });

  async function createAt(protocolVersions?: Record<string, number>) {
    const documentId = generateId();
    const operation = createCreateDocumentOperation(
      documentId,
      DRIVE,
      {},
      { protocolVersions },
    );
    await store.apply(documentId, DRIVE, "document", "main", 0, (txn) => {
      txn.addOperations(operation);
    });
    await store.apply(documentId, DRIVE, "global", "main", 0, (txn) => {
      txn.addOperations({
        id: generateId(),
        index: 0,
        skip: 0,
        hash: "hash-0",
        timestampUtcMs: new Date().toISOString(),
        action: setDriveName({ name: documentId }),
      });
    });
    return documentId;
  }

  async function createModelAt(
    protocolVersions: Record<string, number>,
    model: string,
  ) {
    const documentId = generateId();
    const operation = createCreateDocumentOperation(
      documentId,
      model,
      {},
      { protocolVersions },
    );
    await store.apply(documentId, model, "document", "main", 0, (txn) => {
      txn.addOperations(operation);
    });
    return documentId;
  }

  async function seed() {
    await createAt({ "base-reducer": 7 });
    await createAt({ "base-reducer": 7 });
    await createAt({ "base-reducer": 2 });
    await createAt(undefined);
  }

  it("lists each distinct creation set once and counts its documents", async () => {
    await seed();

    const stored = await storedProtocolVersions(baseDb, schema);

    expect(stored.map((entry) => entry.versions)).toEqual(
      expect.arrayContaining([{ "base-reducer": 7 }, { "base-reducer": 2 }]),
    );
    expect(stored).toHaveLength(2);
    const seven = stored.find((entry) => entry.versions["base-reducer"] === 7);
    expect(await countDocumentsCreatedWith(baseDb, schema, [seven!.hash])).toBe(
      2,
    );
  });

  it("refuses a local set below what the store holds, naming versions and count", async () => {
    await seed();

    const refused = checkStoredProtocols(
      baseDb,
      schema,
      NARROW,
      "refuse",
      createMockLogger(),
    );

    await expect(refused).rejects.toSatisfy(
      (error) =>
        UnsupportedStoredProtocolError.isError(error) &&
        error.documents === 2 &&
        error.message.includes("base-reducer 7"),
    );
    await expect(refused).rejects.toMatchObject({
      versions: [{ protocol: "base-reducer", version: 7 }],
    });
  });

  it("warns instead when told read-only", async () => {
    await seed();
    const logger = createMockLogger();
    const warn = vi.spyOn(logger, "warn");

    await checkStoredProtocols(baseDb, schema, NARROW, "read-only", logger);

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("read-only"),
      expect.stringContaining("2 stored document(s) require base-reducer 7"),
    );
  });

  it("passes a store within the local set, and keys it does not register", async () => {
    await createAt({ "base-reducer": 2 });
    await createAt({ "base-reducer": 2, "app-custom": 9 });
    await createAt(undefined);

    await expect(
      checkStoredProtocols(
        baseDb,
        schema,
        NARROW,
        "refuse",
        createMockLogger(),
      ),
    ).resolves.toEqual(new Map());
  });

  it("lists the same versions once per model and refuses only the model that cannot run them", async () => {
    await createAt({ "base-reducer": 3 });
    await createAt({ "base-reducer": 3 });
    await createModelAt({ "base-reducer": 3 }, MODEL);
    await createModelAt({ "base-reducer": 3 }, LAZY);

    const stored = await storedProtocolVersions(baseDb, schema);
    expect(stored.map(({ model, versions }) => ({ model, versions }))).toEqual(
      expect.arrayContaining([
        { model: DRIVE, versions: { "base-reducer": 3 } },
        { model: MODEL, versions: { "base-reducer": 3 } },
        { model: LAZY, versions: { "base-reducer": 3 } },
      ]),
    );
    expect(stored).toHaveLength(3);

    const modulesOf = (type: string) =>
      type === DRIVE
        ? [driveDocumentModelModule as unknown as DocumentModelModule]
        : type === MODEL
          ? [untaggedModel]
          : [];
    const refused = checkStoredProtocols(
      baseDb,
      schema,
      WIDE,
      "refuse",
      createMockLogger(),
      modulesOf,
    );
    await expect(refused).rejects.toMatchObject({
      documents: 1,
      versions: [{ protocol: "base-reducer", version: 3, documentType: MODEL }],
    });

    const deferred = await checkStoredProtocols(
      baseDb,
      schema,
      WIDE,
      "read-only",
      createMockLogger(),
      modulesOf,
    );
    expect(deferred).toEqual(new Map([[LAZY, [{ "base-reducer": 3 }]]]));
    expect(
      storedModelRefusals(LAZY, deferred, WIDE, [
        {
          ...untaggedModel,
          documentModel: {
            ...untaggedModel.documentModel,
            global: { ...untaggedModel.documentModel.global, id: LAZY },
          },
        },
      ]),
    ).toEqual([{ protocol: "base-reducer", version: 3, documentType: LAZY }]);
  });

  it("stores and lists a creation whose model id is several KB", async () => {
    const model = `test/${Array.from({ length: 200 }, () => generateId()).join("")}`;
    expect(model.length).toBeGreaterThan(4000);
    await createModelAt({ "base-reducer": 2 }, model);

    const stored = await storedProtocolVersions(baseDb, schema);
    expect(stored.map(({ model, versions }) => ({ model, versions }))).toEqual([
      { model, versions: { "base-reducer": 2 } },
    ]);
    expect(
      await countDocumentsCreatedWith(baseDb, schema, [stored[0].hash]),
    ).toBe(1);
  });

  it("passes an empty store", async () => {
    expect(await storedProtocolVersions(baseDb, schema)).toEqual([]);
    await expect(
      checkStoredProtocols(
        baseDb,
        schema,
        NARROW,
        "refuse",
        createMockLogger(),
      ),
    ).resolves.toEqual(new Map());
  });
});
