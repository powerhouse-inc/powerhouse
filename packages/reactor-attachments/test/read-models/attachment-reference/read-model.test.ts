import type {
  DocumentViewDatabase,
  IConsistencyTracker,
  IDocumentModelRegistry,
  IOperationIndex,
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
        execute: () => {
          state.cursor = value.lastOrdinal;
          return Promise.resolve();
        },
      }),
    }),
    transaction: () => ({
      execute: (callback: (trx: unknown) => Promise<void>) =>
        callback({
          updateTable: () => ({
            set: (value: { lastOrdinal: number }) => ({
              where: () => ({
                execute: () => {
                  if (state.failNextSave) {
                    state.failNextSave = false;
                    return Promise.reject(new Error("cursor save failed"));
                  }
                  state.cursor = value.lastOrdinal;
                  return Promise.resolve();
                },
              }),
            }),
          }),
        }),
    }),
  };
  return db as unknown as FakeCursorDb;
}

function page(
  results: OperationWithContext[],
  next?: () => Promise<PagedResults<OperationWithContext>>,
): PagedResults<OperationWithContext> {
  return { results, options: { cursor: "0", limit: 100 }, next };
}

function operationIndex(
  results: OperationWithContext[] = [],
): IOperationIndex & { getSinceOrdinal: ReturnType<typeof vi.fn> } {
  return {
    getSinceOrdinal: vi.fn((ordinal: number) =>
      Promise.resolve(
        page(results.filter((item) => item.context.ordinal > ordinal)),
      ),
    ),
  } as unknown as IOperationIndex & {
    getSinceOrdinal: ReturnType<typeof vi.fn>;
  };
}

function dependencies(options?: {
  cursor?: number;
  indexOperations?: OperationWithContext[];
  module?: DocumentModelModule;
  compiler?: AttachmentSchemaCompiler;
  writer?: IAttachmentReferenceWriter;
}) {
  const db = cursorDb(options?.cursor);
  const index = operationIndex(options?.indexOperations);
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
  return { addReferences, compiler, db, index, model, registry, tracker };
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

  it("ignores failed operations while advancing their ordinal", async () => {
    const { addReferences, db, model, registry } = dependencies();
    await model.indexOperations([op(1, "UNKNOWN", {}, "document-1", "failed")]);
    expect(addReferences).not.toHaveBeenCalled();
    expect(registry.getModule).not.toHaveBeenCalled();
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

  it("restores ordinal 99 after failure at 100, then refills 100 and 101", async () => {
    const addReferences = vi
      .fn()
      .mockRejectedValueOnce(new Error("insert failed"))
      .mockResolvedValue(undefined);
    const { db, index, model } = dependencies({
      cursor: 99,
      writer: { addReferences },
    });
    await model.init();
    const refill = vi.fn((ordinal: number) =>
      Promise.resolve(
        page(
          [op(100), op(101)].filter((item) => item.context.ordinal > ordinal),
        ),
      ),
    );
    Object.assign(index, { getSinceOrdinal: refill });
    await expect(model.indexOperations([op(100)])).rejects.toThrow(
      "insert failed",
    );
    expect(db.cursor).toBe(99);

    await model.indexOperations([op(101)]);
    expect(refill).toHaveBeenCalledWith(99);
    expect(addReferences).toHaveBeenLastCalledWith([
      expect.objectContaining({ ordinal: 100 }),
      expect.objectContaining({ ordinal: 101 }),
    ]);
    expect(db.cursor).toBe(101);
  });

  it("serializes cross-document calls in global ordinal order", async () => {
    let releaseFirst!: () => void;
    const firstBlocked = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const committed: number[] = [];
    const writer: IAttachmentReferenceWriter = {
      addReferences: vi.fn(
        async (references: readonly AttachmentReferenceInput[]) => {
          committed.push(...references.map(({ ordinal }) => ordinal));
          if (references[0]?.ordinal === 1) await firstBlocked;
        },
      ),
    };
    const { model } = dependencies({ writer });
    const first = model.indexOperations([op(1, undefined, undefined, "alpha")]);
    const second = model.indexOperations([op(2, undefined, undefined, "beta")]);
    await Promise.resolve();
    expect(committed).toEqual([1]);
    releaseFirst();
    await Promise.all([first, second]);
    expect(committed).toEqual([1, 2]);
  });

  it("replays idempotently when insert succeeds but cursor save fails", async () => {
    const stored = new Set<string>();
    const addReferences = vi.fn(
      (references: readonly AttachmentReferenceInput[]) => {
        for (const reference of references) {
          stored.add(`${reference.documentId}:${reference.ref}`);
        }
        return Promise.resolve();
      },
    );
    const writer: IAttachmentReferenceWriter = {
      addReferences,
    };
    const { db, model } = dependencies({ cursor: 0, writer });
    db.failNextSave = true;
    await expect(model.indexOperations([op(1)])).rejects.toThrow(
      "cursor save failed",
    );
    expect(db.cursor).toBe(0);
    await model.indexOperations([op(1)]);
    expect(stored.size).toBe(1);
    expect(addReferences).toHaveBeenCalledTimes(2);
    expect(db.cursor).toBe(1);
  });

  it("ignores processed ordinals", async () => {
    const { addReferences, model } = dependencies({ cursor: 5 });
    await model.init();
    await model.indexOperations([op(4), op(5)]);
    expect(addReferences).not.toHaveBeenCalled();
  });

  it("keeps errors observable and the queue reusable", async () => {
    const addReferences = vi
      .fn()
      .mockRejectedValueOnce(new Error("visible failure"))
      .mockResolvedValue(undefined);
    const { db, model } = dependencies({ writer: { addReferences } });
    await expect(model.indexOperations([op(1)])).rejects.toThrow(
      "visible failure",
    );
    await model.indexOperations([op(1)]);
    expect(db.cursor).toBe(1);
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

  it("fills internal gaps across pages and rejects unresolved gaps", async () => {
    const { db, index, model } = dependencies({ cursor: 9 });
    await model.init();
    index.getSinceOrdinal.mockResolvedValueOnce(
      page([op(10)], () => Promise.resolve(page([op(11), op(12)]))),
    );
    await model.indexOperations([op(10), op(12)]);
    expect(db.cursor).toBe(12);

    const unresolved = dependencies({ cursor: 20 });
    await unresolved.model.init();
    await expect(unresolved.model.indexOperations([op(22)])).rejects.toThrow(
      "missing ordinal 21",
    );
    expect(unresolved.db.cursor).toBe(20);
  });
});
