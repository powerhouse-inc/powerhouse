import type {
  DocumentViewDatabase,
  IConsistencyTracker,
  IDocumentModelRegistry,
  IOperationIndex,
  ISettledWatermark,
  IWriteCache,
  PagedResults,
} from "@powerhousedao/reactor";
import type {
  Action,
  DocumentModelModule,
  DocumentSpecification,
  OperationSpecification,
  OperationWithContext,
} from "@powerhousedao/shared/document-model";
import type { Kysely } from "kysely";
import { describe, expect, it, vi } from "vitest";
import { AttachmentSchemaCompiler } from "../../../src/reference-index/attachment-schema-compiler.js";
import {
  ATTACHMENT_REFERENCE_READ_MODEL_ID,
  AttachmentReferenceReadModel,
} from "../../../src/read-models/attachment-reference/attachment-reference-read-model.js";
import type {
  AttachmentReferenceInput,
  IAttachmentReferenceWriter,
} from "../../../src/read-models/attachment-reference/types.js";

const REF_A = `attachment://v1:${"a".repeat(64)}` as const;
const REF_B = `attachment://v1:${"b".repeat(64)}` as const;

function operationSpec(
  name: string,
  schema: string | null,
): OperationSpecification {
  return {
    description: null,
    errors: [],
    examples: [],
    id: `operation-${name}`,
    name,
    reducer: null,
    schema,
    scope: "global",
    template: null,
  };
}

function moduleWithOperations(
  operations: OperationSpecification[],
  version = 1,
): DocumentModelModule {
  const specification: DocumentSpecification = {
    changeLog: [],
    modules: [
      { description: null, id: "attachments", name: "attachments", operations },
    ],
    state: {
      global: { examples: [], initialValue: "{}", schema: "" },
      local: { examples: [], initialValue: "{}", schema: "" },
    },
    version,
  };
  return {
    actions: {},
    documentModel: {
      global: {
        id: "example/attachments",
        specifications: [specification],
      },
    },
    version,
  } as unknown as DocumentModelModule;
}

const standardModule = moduleWithOperations([
  operationSpec(
    "ATTACH_FILES",
    `input AttachFilesInput { refs: [AttachmentRef!]! }`,
  ),
  operationSpec("REMOVE_FILE", `input RemoveFileInput { ref: AttachmentRef! }`),
  operationSpec("RENAME", `input RenameInput { name: String! }`),
]);

function op(
  ordinal: number,
  type = "ATTACH_FILES",
  input: unknown = { refs: [REF_A] },
  documentId = `document-${ordinal}`,
  error?: string,
): OperationWithContext {
  return {
    operation: {
      id: `operation-${ordinal}`,
      index: ordinal,
      skip: 0,
      timestampUtcMs: "2026-07-22T00:00:00.000Z",
      hash: `hash-${ordinal}`,
      action: {
        id: `action-${ordinal}`,
        type,
        scope: "global",
        input,
        timestampUtcMs: "2026-07-22T00:00:00.000Z",
      } as Action,
      ...(error === undefined ? {} : { error }),
    },
    context: {
      documentId,
      documentType: "example/attachments",
      scope: "global",
      branch: "main",
      ordinal,
    },
  };
}

type FakeCursorDb = Kysely<DocumentViewDatabase> & {
  cursor: number | undefined;
  failNextSave: boolean;
};

function cursorDb(cursor?: number): FakeCursorDb {
  const state = { cursor, failNextSave: false };
  const update = (value: { lastOrdinal: number }) => {
    const chain = {
      where: () => chain,
      executeTakeFirst: () => {
        if (state.failNextSave) {
          state.failNextSave = false;
          return Promise.reject(new Error("cursor save failed"));
        }
        state.cursor = value.lastOrdinal;
        return Promise.resolve({ numUpdatedRows: 1n });
      },
    };
    return chain;
  };
  const db = {
    get cursor() {
      return state.cursor;
    },
    set cursor(value: number | undefined) {
      state.cursor = value;
    },
    get failNextSave() {
      return state.failNextSave;
    },
    set failNextSave(value: boolean) {
      state.failNextSave = value;
    },
    selectFrom: () => ({
      select: () => ({
        where: () => ({
          executeTakeFirst: () =>
            Promise.resolve(
              state.cursor === undefined
                ? undefined
                : { lastOrdinal: state.cursor },
            ),
        }),
      }),
    }),
    insertInto: () => ({
      values: (value: { lastOrdinal: number }) => ({
        onConflict: () => ({
          execute: () => {
            state.cursor ??= value.lastOrdinal;
            return Promise.resolve();
          },
        }),
      }),
    }),
    updateTable: () => ({ set: update }),
  };
  return db as unknown as FakeCursorDb;
}

function page(
  results: OperationWithContext[],
  next?: () => Promise<PagedResults<OperationWithContext>>,
): PagedResults<OperationWithContext> {
  return { results, options: { cursor: "0", limit: 100 }, next };
}

/** As the index does: everything above `ordinal`, ordered by ordinal ascending. */
function since(
  store: readonly OperationWithContext[],
  ordinal: number,
): PagedResults<OperationWithContext> {
  return page(
    store
      .filter((item) => item.context.ordinal > ordinal)
      .sort((left, right) => left.context.ordinal - right.context.ordinal),
  );
}

function operationIndex(
  results: OperationWithContext[] = [],
): IOperationIndex & { getSinceOrdinal: ReturnType<typeof vi.fn> } {
  return {
    getSinceOrdinal: vi.fn((ordinal: number) =>
      Promise.resolve(since(results, ordinal)),
    ),
    getByOrdinals: vi.fn((ordinals: readonly number[]) =>
      Promise.resolve(
        results
          .filter((item) => ordinals.includes(item.context.ordinal))
          .sort((left, right) => left.context.ordinal - right.context.ordinal),
      ),
    ),
    getStreamAfter: vi.fn(() => Promise.resolve([])),
  } as unknown as IOperationIndex & {
    getSinceOrdinal: ReturnType<typeof vi.fn>;
  };
}

/** Everything in the store is settled. */
function storeWatermark(
  store: readonly OperationWithContext[],
): ISettledWatermark {
  const settled = () =>
    store.reduce((max, item) => Math.max(max, item.context.ordinal), 0);
  return {
    get settledThrough() {
      return settled();
    },
    refresh: () => Promise.resolve(settled()),
    onAdvance: () => () => {},
    status: () => ({
      head: settled(),
      settledThrough: settled(),
      waitingOn: [],
    }),
  };
}

function dependencies(options?: {
  cursor?: number;
  indexOperations?: OperationWithContext[];
  module?: DocumentModelModule;
  compiler?: AttachmentSchemaCompiler;
  writer?: IAttachmentReferenceWriter;
}) {
  const store = options?.indexOperations ?? [];
  const db = cursorDb(options?.cursor);
  const index = operationIndex(store);
  const registry = {
    getModule: vi.fn(() => options?.module ?? standardModule),
  } as unknown as IDocumentModelRegistry & {
    getModule: ReturnType<typeof vi.fn>;
  };
  const compiler = options?.compiler ?? new AttachmentSchemaCompiler();
  const addReferences = vi.fn(() => Promise.resolve());
  const writer =
    options?.writer ?? ({ addReferences } as IAttachmentReferenceWriter);
  const tracker = { update: vi.fn() } as unknown as IConsistencyTracker;
  const model = new AttachmentReferenceReadModel(
    db,
    index,
    {} as IWriteCache,
    tracker,
    registry,
    compiler,
    writer,
  );
  model.attachCatchUp(storeWatermark(store), 100_000);
  const sweep = () => {
    const present = store
      .map((item) => item.context.ordinal)
      .sort((left, right) => left - right);
    return model.sweep(Math.max(0, ...present), present);
  };
  return {
    addReferences,
    compiler,
    db,
    index,
    model,
    registry,
    store,
    sweep,
    tracker,
  };
}

describe("AttachmentReferenceReadModel", () => {
  it("has a stable name and indexes zero, one, and multiple typed refs", async () => {
    const { addReferences, model } = dependencies();
    expect(model.name).toBe(ATTACHMENT_REFERENCE_READ_MODEL_ID);

    await model.indexOperations([op(1, "RENAME", { name: "Nothing" })]);
    expect(addReferences).not.toHaveBeenCalled();

    await model.indexOperations([op(2)]);
    expect(addReferences).toHaveBeenLastCalledWith([
      expect.objectContaining({
        documentId: "document-2",
        ref: REF_A,
        operationId: "operation-2",
        branch: "main",
        scope: "global",
        ordinal: 2,
      }),
    ]);

    await model.indexOperations([
      op(3, "ATTACH_FILES", { refs: [REF_A, REF_B] }),
    ]);
    expect(addReferences).toHaveBeenLastCalledWith([
      expect.objectContaining({ ref: REF_A, ordinal: 3 }),
      expect.objectContaining({ ref: REF_B, ordinal: 3 }),
    ]);
  });

  it("ignores failed operations while a sweep advances past their ordinal", async () => {
    const failed = op(1, "UNKNOWN", {}, "document-1", "failed");
    const { addReferences, db, model, registry, sweep } = dependencies({
      cursor: 0,
      indexOperations: [failed],
    });
    await model.indexOperations([failed]);
    expect(addReferences).not.toHaveBeenCalled();
    expect(registry.getModule).not.toHaveBeenCalled();

    await sweep();
    expect(db.cursor).toBe(1);
  });

  it("keeps typed removal references append-only and idempotent", async () => {
    const stored = new Map<string, AttachmentReferenceInput>();
    const writer: IAttachmentReferenceWriter = {
      addReferences: vi.fn(
        (references: readonly AttachmentReferenceInput[]) => {
          for (const reference of references) {
            const key = `${reference.documentId}:${reference.ref}`;
            if (!stored.has(key)) stored.set(key, reference);
          }
          return Promise.resolve();
        },
      ),
    };
    const { model } = dependencies({ writer });
    await model.indexOperations([op(1)]);
    await model.indexOperations([
      op(2, "REMOVE_FILE", { ref: REF_A }, "document-1"),
    ]);
    expect([...stored.values()]).toEqual([
      expect.objectContaining({ ref: REF_A, operationId: "operation-1" }),
    ]);
  });

  it("uses the latest live module and exposes malformed extraction failures", async () => {
    const latest = moduleWithOperations(
      [
        operationSpec(
          "ATTACH_FILES",
          `input AttachFilesInput { refs: [AttachmentRef!]! }`,
        ),
      ],
      2,
    );
    const { db, model, registry } = dependencies({ module: latest });
    await expect(
      model.indexOperations([op(1, "ATTACH_FILES", { refs: ["bad-ref"] })]),
    ).rejects.toThrow(/AttachmentRef is malformed/);
    expect(registry.getModule).toHaveBeenCalledWith("example/attachments");
    expect(db.cursor).toBeUndefined();
  });

  it("initializes from a persisted cursor and backfills later operations", async () => {
    const { addReferences, db, index, model } = dependencies({
      cursor: 1,
      indexOperations: [op(1), op(2, "ATTACH_FILES", { refs: [REF_B] })],
    });
    await model.init();
    expect(index.getSinceOrdinal).toHaveBeenCalledWith(1);
    expect(addReferences).toHaveBeenCalledWith([
      expect.objectContaining({ ref: REF_B, ordinal: 2 }),
    ]);
    expect(db.cursor).toBe(2);
  });

  it("holds the cursor at 99 after a failure at 100, then a sweep refills 100", async () => {
    const addReferences = vi
      .fn()
      .mockRejectedValueOnce(new Error("insert failed"))
      .mockResolvedValue(undefined);
    const { db, model, store, sweep } = dependencies({
      cursor: 99,
      writer: { addReferences },
    });
    await model.init();
    store.push(op(100), op(101));

    await expect(model.indexOperations([op(100)])).rejects.toThrow(
      "insert failed",
    );
    await model.indexOperations([op(101)]);
    await sweep();

    expect(addReferences).toHaveBeenLastCalledWith([
      expect.objectContaining({ ordinal: 100 }),
    ]);
    expect(db.cursor).toBe(101);
  });

  it("keeps what it applied when a sweep's cursor write fails", async () => {
    const { addReferences, db, model, sweep } = dependencies({
      cursor: 0,
      indexOperations: [op(1)],
    });
    await model.indexOperations([op(1)]);

    db.failNextSave = true;
    await expect(sweep()).rejects.toThrow("cursor save failed");
    expect(db.cursor).toBe(0);

    await sweep();
    expect(addReferences).toHaveBeenCalledTimes(1);
    expect(db.cursor).toBe(1);
  });

  it("drops a redelivered ordinal at or below the cursor", async () => {
    const { addReferences, db, index, model } = dependencies({ cursor: 5 });
    await model.init();
    index.getSinceOrdinal.mockClear();

    await model.indexOperations([op(4), op(5)]);

    expect(addReferences).not.toHaveBeenCalled();
    expect(index.getSinceOrdinal).not.toHaveBeenCalled();
    expect(db.cursor).toBe(5);
  });

  it("keeps errors observable and the live path reusable", async () => {
    const addReferences = vi
      .fn()
      .mockRejectedValueOnce(new Error("visible failure"))
      .mockResolvedValue(undefined);
    const { db, model, sweep } = dependencies({
      cursor: 0,
      writer: { addReferences },
      indexOperations: [op(1)],
    });
    await expect(model.indexOperations([op(1)])).rejects.toThrow(
      "visible failure",
    );
    await model.indexOperations([op(1)]);
    await sweep();
    expect(addReferences).toHaveBeenCalledTimes(2);
    expect(db.cursor).toBe(1);
  });

  it("keeps a missing-module operation retryable and sweeps it after registration", async () => {
    const { addReferences, db, model, registry, store, sweep } = dependencies({
      cursor: 0,
    });
    await model.init();
    store.push(op(1), op(2, "ATTACH_FILES", { refs: [REF_B] }));
    registry.getModule.mockImplementation(() => {
      throw new Error("module not registered");
    });
    await expect(model.indexOperations([op(1)])).rejects.toThrow(
      "module not registered",
    );

    const held = await sweep();
    expect(held.to).toBe(0);
    expect(held.blockedAt).toMatchObject({ ordinal: 1 });

    registry.getModule.mockReturnValue(standardModule);
    await sweep();
    expect(addReferences).toHaveBeenCalledWith([
      expect.objectContaining({ ordinal: 1 }),
    ]);
    expect(addReferences).toHaveBeenCalledWith([
      expect.objectContaining({ ordinal: 2 }),
    ]);
    expect(db.cursor).toBe(2);
  });

  it("reuses one compiled extractor on the hot path and performs no no-ref write", async () => {
    class CountingCompiler extends AttachmentSchemaCompiler {
      readonly extractors = new Set<unknown>();

      override forModuleAction(
        module: DocumentModelModule,
        actionType: string,
      ) {
        const extractor = super.forModuleAction(module, actionType);
        this.extractors.add(extractor);
        return extractor;
      }
    }
    const compiler = new CountingCompiler();
    const { addReferences, model } = dependencies({ compiler });
    await model.indexOperations(
      Array.from({ length: 25 }, (_, index) => op(index + 1)),
    );
    expect(compiler.extractors.size).toBe(1);
    expect(addReferences).toHaveBeenCalledTimes(1);

    addReferences.mockClear();
    await model.indexOperations([op(26, "RENAME", { name: "no attachment" })]);
    expect(addReferences).not.toHaveBeenCalled();
  });

  it("catches up across a permanent hole on init instead of throwing", async () => {
    const { addReferences, db, model } = dependencies({
      cursor: 10,
      indexOperations: [op(11), op(13)],
    });

    await expect(model.init()).resolves.toBeUndefined();

    expect(addReferences).toHaveBeenCalledWith([
      expect.objectContaining({ ordinal: 11 }),
      expect.objectContaining({ ordinal: 13 }),
    ]);
    expect(db.cursor).toBe(13);
  });

  it("P7: indexes a reference whose batch never arrived, without a later batch", async () => {
    const { addReferences, db, model, store, sweep } = dependencies({
      cursor: 0,
    });
    await model.init();

    store.push(op(1));
    await sweep();

    expect(addReferences).toHaveBeenCalledWith([
      expect.objectContaining({ ref: REF_A, ordinal: 1 }),
    ]);
    expect(db.cursor).toBe(1);
  });
});
