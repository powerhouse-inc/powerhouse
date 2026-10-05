import type { DocumentDrivePHState } from "@powerhousedao/shared/document-drive";
import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import type {
  DefinitionDiagnostic,
  DocumentModelModule,
} from "@powerhousedao/shared/document-model";
import { describe, expect, expectTypeOf, it } from "vitest";
import { DocumentModelDefinitionError } from "../../src/definition/diagnostics.js";
import { ph } from "../../src/definition/field.js";
import type {
  ActionOf,
  DocumentOf,
  GlobalStateOf,
  LocalStateOf,
} from "../../src/definition/model.js";
import { defineDocumentModel } from "../../src/definition/model.js";
import { emitDeclaration } from "./helpers/declaration-emit.js";
import { Invoice } from "./fixtures/invoice.js";
import {
  capturedCodeFirstInputs,
  capturedSchemaFirstInputs,
  codeFirstParity,
  type ParityPHState,
  schemaFirstParity,
} from "./fixtures/parity-model.js";

function diagnosticsOf(run: () => unknown): readonly DefinitionDiagnostic[] {
  try {
    run();
  } catch (error) {
    if (error instanceof DocumentModelDefinitionError) return error.diagnostics;
    throw error;
  }
  throw new Error("expected a DocumentModelDefinitionError");
}

/** Platform-assigned metadata differs per action; everything else must match. */
function withoutMetadata(action: Record<string, unknown>) {
  const { id: _id, timestampUtcMs: _timestamp, ...rest } = action;
  return rest;
}

describe("a finalized module", () => {
  it("satisfies DocumentModelModule without a cast", () => {
    const consume = (module: DocumentModelModule<ParityPHState>) =>
      module.utils.fileExtension;
    expect(consume(codeFirstParity)).toBe("parity");
    expect(consume(schemaFirstParity)).toBe("parity");
    expect(codeFirstParity.version).toBe(1);
    expect(Object.isFrozen(codeFirstParity)).toBe(false);
  });

  it("is exactly as assignable as a generated module", () => {
    // Each module satisfies its own instantiation.
    const generated: DocumentModelModule<DocumentDrivePHState> =
      driveDocumentModelModule;
    const compiled: DocumentModelModule<ParityPHState> = codeFirstParity;
    expect(generated.utils.fileExtension.length).toBeGreaterThan(0);
    expect(compiled.utils.fileExtension).toBe("parity");
    // Neither satisfies the default `PHBaseState` instantiation, because
    // `Reducer<TState>` is contravariant in its document parameter. The
    // compiled module is no less assignable to a consumer than a generated
    // one, which is what behavioral equality asks for here.
    expectTypeOf<
      typeof driveDocumentModelModule
    >().not.toMatchTypeOf<DocumentModelModule>();
    expectTypeOf<
      typeof codeFirstParity
    >().not.toMatchTypeOf<DocumentModelModule>();
  });

  it("matches the schema-first actions map key for key", () => {
    expect(Object.keys(codeFirstParity.actions)).toStrictEqual(
      Object.keys(schemaFirstParity.actions),
    );
  });

  it("keeps the later-spread collision behavior of the actions map", () => {
    const model = defineDocumentModel({
      id: "test/collision",
      name: "Collision",
      description: "",
      extension: "c",
      version: 1,
      author: { name: "Powerhouse" },
      specifications: {
        global: {
          schema: ph.object("CollisionState", {
            fields: { title: ph.String({ required: true }) },
          }),
          initialValue: { title: "" },
        },
        local: { schema: null, initialValue: {} },
      },
    });
    const module = model.module("base", {
      operations: ({ global }) => ({
        // `noop` is also a base action, so the model creator wins the spread.
        noop: global({
          input: ph.input({ fields: {} }),
          reduce(state) {
            state.title = "";
          },
        }),
      }),
    });
    const finalized = model.finalize({ modules: [module] });
    expect(finalized.actions.noop().type).toBe("NOOP");
    expect(finalized.actions.noop().input).toStrictEqual({});
  });

  it("produces the same action as the schema-first creator", () => {
    const input = { id: "a", title: "t", completed: false };
    expect(
      withoutMetadata(codeFirstParity.actions.addTodo(input)),
    ).toStrictEqual(withoutMetadata(schemaFirstParity.actions.addTodo(input)));
    expect(withoutMetadata(codeFirstParity.actions.clear())).toStrictEqual(
      withoutMetadata(schemaFirstParity.actions.clear()),
    );
    expect(withoutMetadata(codeFirstParity.actions.clear({}))).toStrictEqual(
      withoutMetadata(schemaFirstParity.actions.clear({})),
    );
  });

  it("rejects invalid creator input the way the schema-first creator does", () => {
    const invalid = { id: 1, title: "t", completed: false } as never;
    expect(() => codeFirstParity.actions.addTodo(invalid)).toThrow();
    expect(() => schemaFirstParity.actions.addTodo(invalid)).toThrow();
  });

  it("keeps unknown keys in the creator's shallow clone and hands the reducer the raw input", () => {
    capturedCodeFirstInputs.length = 0;
    capturedSchemaFirstInputs.length = 0;
    const input = {
      id: "a",
      title: "t",
      completed: false,
      unknown: "kept",
    } as never;
    const codeFirstAction = codeFirstParity.actions.addTodo(input);
    const schemaFirstAction = schemaFirstParity.actions.addTodo(input);
    expect(codeFirstAction.input).toStrictEqual(schemaFirstAction.input);
    expect((codeFirstAction.input as Record<string, unknown>).unknown).toBe(
      "kept",
    );
    // The clone is shallow and the persisted object is not the caller's.
    expect(codeFirstAction.input).not.toBe(input);
    codeFirstParity.reducer(
      codeFirstParity.utils.createDocument(),
      codeFirstAction,
    );
    schemaFirstParity.reducer(
      schemaFirstParity.utils.createDocument(),
      schemaFirstAction,
    );
    // Both reducers see the persisted action input object itself, not a copy
    // Zod returned.
    expect(capturedCodeFirstInputs[0]).toBe(codeFirstAction.input);
    expect(capturedSchemaFirstInputs[0]).toBe(schemaFirstAction.input);
  });

  it("selects state from the persisted scope, matching the schema-first module", () => {
    const codeFirstAction = {
      ...codeFirstParity.actions.setNote({ note: "hello" }),
      scope: "local" as const,
    };
    const misrouted = { ...codeFirstAction, scope: "global" as const };
    const codeFirstDocument = codeFirstParity.reducer(
      codeFirstParity.utils.createDocument(),
      misrouted,
    );
    const schemaFirstDocument = schemaFirstParity.reducer(
      schemaFirstParity.utils.createDocument(),
      { ...misrouted },
    );
    // The declared scope is local; the persisted scope wins in both modules.
    expect(codeFirstDocument.state.global).toStrictEqual(
      schemaFirstDocument.state.global,
    );
    expect(codeFirstDocument.state.local).toStrictEqual(
      schemaFirstDocument.state.local,
    );
    expect(
      (codeFirstDocument.state.global as unknown as { note?: string }).note,
    ).toBe("hello");
    expect(codeFirstDocument.state.local.note).toBeNull();
  });

  it("treats an unknown action type as a no-op", () => {
    const document = codeFirstParity.utils.createDocument();
    const unknown = {
      ...codeFirstParity.actions.clear(),
      type: "NOT_A_MODEL_ACTION",
    };
    const codeFirst = codeFirstParity.reducer(document, unknown);
    const schemaFirst = schemaFirstParity.reducer(
      schemaFirstParity.utils.createDocument(),
      { ...unknown },
    );
    expect(codeFirst.state.global).toStrictEqual(schemaFirst.state.global);
    expect(codeFirst.operations.global.at(-1)?.error).toBeUndefined();
  });

  it("records the thrown message and rolls state back, like the schema-first module", () => {
    const codeFirst = codeFirstParity.reducer(
      codeFirstParity.utils.createDocument(),
      codeFirstParity.actions.setNote({ note: "boom" }),
    );
    const schemaFirst = schemaFirstParity.reducer(
      schemaFirstParity.utils.createDocument(),
      schemaFirstParity.actions.setNote({ note: "boom" }),
    );
    expect(codeFirst.operations.local.at(-1)?.error).toBe("note rejected");
    expect(schemaFirst.operations.local.at(-1)?.error).toBe("note rejected");
    expect(codeFirst.state.local).toStrictEqual(schemaFirst.state.local);
    expect(codeFirst.state.local.note).toBeNull();
  });

  it("rejects invalid input again in the reducer, for a raw action", () => {
    const document = codeFirstParity.utils.createDocument();
    const raw = {
      ...codeFirstParity.actions.clear(),
      type: "ADD_TODO",
      input: { id: 1 },
    };
    const codeFirst = codeFirstParity.reducer(document, raw);
    const schemaFirst = schemaFirstParity.reducer(
      schemaFirstParity.utils.createDocument(),
      { ...raw },
    );
    expect(codeFirst.operations.global.at(-1)?.error).toBe(
      schemaFirst.operations.global.at(-1)?.error,
    );
    expect(codeFirst.state.global.todos).toStrictEqual([]);
  });

  it("matches the schema-first state and document guards", () => {
    const valid = codeFirstParity.utils.createDocument();
    const malformed: readonly unknown[] = [
      undefined,
      null,
      {},
      { global: {} },
      { ...valid.state, global: { title: "", todos: [{ id: 1 }] } },
      { ...valid.state, global: { title: 4, todos: [] } },
      { ...valid.state, global: { title: "", todos: {} } },
      valid.state,
      { ...valid.state, local: undefined },
      { ...valid.state, extra: true },
    ];
    for (const candidate of malformed) {
      expect(
        codeFirstParity.utils.isStateOfType(candidate),
        JSON.stringify(candidate),
      ).toBe(schemaFirstParity.utils.isStateOfType(candidate));
    }
    const documents: readonly unknown[] = [
      valid,
      { ...valid, header: { ...valid.header, documentType: "other" } },
      { ...valid, state: {} },
      { ...valid, initialState: {} },
      { header: valid.header },
      {},
    ];
    for (const candidate of documents) {
      expect(
        codeFirstParity.utils.isDocumentOfType(candidate),
        JSON.stringify(candidate),
      ).toBe(schemaFirstParity.utils.isDocumentOfType(candidate));
    }
  });

  it("matches the schema-first assertion variants", () => {
    const valid = codeFirstParity.utils.createDocument();
    expect(() =>
      codeFirstParity.utils.assertIsStateOfType(valid.state),
    ).not.toThrow();
    expect(() => codeFirstParity.utils.assertIsStateOfType({})).toThrow();
    expect(() =>
      codeFirstParity.utils.assertIsDocumentOfType(valid),
    ).not.toThrow();
    expect(() => codeFirstParity.utils.assertIsDocumentOfType({})).toThrow();
  });

  /**
   * Wave B pinned the compiled validators against the checked-in
   * `document-drive` schemas, where a nullable object field is `.nullable()`
   * (decision 27). The installed validation-schema plugin now emits
   * `.nullish()` for that position, so a newly generated model accepts an
   * absent nullable state key while the compiled validator rejects it. The
   * difference is recorded here rather than hidden; the parity goldens in
   * `test/parity/goldens` decide whether the compiled mapping moves.
   */
  it("pins the one known nullable-state-field divergence", () => {
    const withoutTitle = {
      ...codeFirstParity.utils.createDocument().state,
      global: { todos: [] },
    };
    expect(schemaFirstParity.utils.isStateOfType(withoutTitle)).toBe(true);
    expect(codeFirstParity.utils.isStateOfType(withoutTitle)).toBe(false);
  });

  it("creates state and documents with the schema-first base fields", () => {
    const codeFirst = codeFirstParity.utils.createState();
    const schemaFirst = schemaFirstParity.utils.createState();
    expect(codeFirst).toStrictEqual(schemaFirst);
    expect(codeFirst.document.version).toBe(1);
    // Overrides are shallow in both.
    const overridden = codeFirstParity.utils.createState({
      global: { title: "given" } as never,
      document: { version: 7 } as never,
    });
    // Overrides merge into the initial value, one scope at a time.
    expect(overridden.global).toStrictEqual({ title: "given", todos: [] });
    expect(
      schemaFirstParity.utils.createState({
        global: { title: "given" } as never,
        document: { version: 7 } as never,
      }),
    ).toStrictEqual(overridden);
    expect(overridden.document.version).toBe(7);
    expect(overridden.local).toStrictEqual({ note: null });
    const document = codeFirstParity.utils.createDocument();
    expect(document.header.documentType).toBe("test/parity");
    expect(document.state.global).toStrictEqual({ title: "", todos: [] });
  });

  it("stores the specification the schema-first module stores, except where a task mandates otherwise", () => {
    const codeFirst = codeFirstParity.documentModel.global.specifications[0];
    const schemaFirst =
      schemaFirstParity.documentModel.global.specifications[0];
    expect(codeFirst.version).toBe(schemaFirst.version);
    expect(codeFirst.changeLog).toStrictEqual(schemaFirst.changeLog);
    expect(codeFirst.state.global.initialValue).toBe(
      schemaFirst.state.global.initialValue,
    );
    expect(codeFirst.state.local.initialValue).toBe(
      schemaFirst.state.local.initialValue,
    );
    expect(codeFirst.state.global.examples).toStrictEqual([]);
    expect(codeFirst.modules).toHaveLength(schemaFirst.modules.length);
    expect(codeFirst.modules[0].operations).toHaveLength(
      schemaFirst.modules[0].operations.length,
    );

    // The stored SDL is semantically the same document; the bytes differ only
    // by the printer's trailing newline.
    expect(codeFirst.state.global.schema).toBe(
      `${schemaFirst.state.global.schema}\n`,
    );
    expect(codeFirst.state.local.schema).toBe(
      `${schemaFirst.state.local.schema}\n`,
    );
    for (const [
      index,
      operation,
    ] of codeFirst.modules[0].operations.entries()) {
      const equivalent = schemaFirst.modules[0].operations[index];
      expect(operation.schema).toBe(`${equivalent.schema ?? ""}\n`);
      expect(operation.scope).toBe(equivalent.scope);
      expect(operation.errors).toStrictEqual(equivalent.errors);
      expect(operation.examples).toStrictEqual(equivalent.examples);
    }

    // Everything else that differs, and the task that mandates it. The
    // schema-first side of this fixture carries the values the corpus
    // carries — an authored `""` and an editor-authored name — so this list
    // cannot pass by agreeing with the compiler.
    const divergences = codeFirst.modules.flatMap((module, moduleIndex) => {
      const equivalent = schemaFirst.modules[moduleIndex];
      return [
        {
          field: "module.name",
          codeFirst: module.name,
          schemaFirst: equivalent.name,
        },
        {
          field: "module.description",
          codeFirst: module.description,
          schemaFirst: equivalent.description,
        },
        ...module.operations.map((operation, operationIndex) => ({
          field: "operation.name",
          codeFirst: operation.name,
          schemaFirst: equivalent.operations[operationIndex].name,
        })),
        ...module.operations.map((operation, operationIndex) => ({
          field: "operation.template",
          codeFirst: operation.template,
          schemaFirst: equivalent.operations[operationIndex].template,
        })),
      ];
    });
    expect(divergences).toStrictEqual([
      // Task 005: the stored module name is `pascalCase(moduleKey)`; the
      // corpus stores the name the editor author typed. Every consumer
      // re-derives through change-case, so the two are equivalent.
      { field: "module.name", codeFirst: "Todos", schemaFirst: "todos" },
      // Task 016: an omitted description materializes as null, and an
      // authored empty string stays an empty string. The corpus stores "".
      {
        field: "module.description",
        codeFirst: null,
        schemaFirst: "",
      },
      // Task 005: the stored operation name is `pascalCase(operationKey)`.
      {
        field: "operation.name",
        codeFirst: "AddTodo",
        schemaFirst: "ADD_TODO",
      },
      {
        field: "operation.name",
        codeFirst: "EditTitle",
        schemaFirst: "EDIT_TITLE",
      },
      { field: "operation.name", codeFirst: "Clear", schemaFirst: "CLEAR" },
      {
        field: "operation.name",
        codeFirst: "SetNote",
        schemaFirst: "SET_NOTE",
      },
      // Task 015: template and reducerTemplate default to null.
      { field: "operation.template", codeFirst: null, schemaFirst: "" },
      { field: "operation.template", codeFirst: null, schemaFirst: "" },
      { field: "operation.template", codeFirst: null, schemaFirst: "" },
      { field: "operation.template", codeFirst: null, schemaFirst: "" },
    ]);
  });

  it("throws one error for duplicate derived action types", () => {
    const model = defineDocumentModel({
      id: "test/duplicate",
      name: "Duplicate",
      description: "",
      extension: "d",
      version: 1,
      author: { name: "Powerhouse" },
      specifications: {
        global: {
          schema: ph.object("DuplicateState", {
            fields: { title: ph.String({ required: true }) },
          }),
          initialValue: { title: "" },
        },
        local: { schema: null, initialValue: {} },
      },
    });
    const first = model.module("first", {
      operations: ({ global }) => ({
        setTitle: global({
          input: ph.input({ fields: { title: ph.String({ required: true }) } }),
          reduce() {},
        }),
      }),
    });
    const second = model.module("second", {
      operations: ({ global }) => ({
        setTitle: global({
          input: ph.input({ fields: { title: ph.String({ required: true }) } }),
          reduce() {},
        }),
      }),
    });
    const diagnostics = diagnosticsOf(() =>
      model.finalize({ modules: [first, second] }),
    );
    expect(
      diagnostics.filter(
        (diagnostic) => diagnostic.code === "PH-DM-DUPLICATE-ACTION",
      ),
    ).toHaveLength(1);
  });

  it("exports the four type helpers with literal narrowing", () => {
    expectTypeOf<GlobalStateOf<typeof Invoice>>().not.toBeNever();
    expectTypeOf<GlobalStateOf<typeof Invoice>>().toHaveProperty("lineItems");
    expectTypeOf<GlobalStateOf<typeof Invoice>["status"]>().toEqualTypeOf<
      "DRAFT" | "ISSUED" | "PAID" | "VOID"
    >();
    expectTypeOf<LocalStateOf<typeof Invoice>>().not.toBeNever();
    expectTypeOf<LocalStateOf<typeof Invoice>>().toHaveProperty("draftNote");
    expectTypeOf<DocumentOf<typeof Invoice>>().not.toBeNever();
    expectTypeOf<DocumentOf<typeof Invoice>>().toHaveProperty("header");
    expectTypeOf<DocumentOf<typeof Invoice>>().toHaveProperty("state");
    expectTypeOf<ActionOf<typeof Invoice>>().not.toBeNever();
    expectTypeOf<ActionOf<typeof Invoice>>().toHaveProperty("type");
    expectTypeOf(Invoice.actions.addLineItem).parameter(0).toMatchTypeOf<{
      id: string;
      description: string;
      quantity: number;
      unitPrice: number;
    }>();
    expectTypeOf(Invoice.actions.issue).returns.toHaveProperty("scope");
    const issued = Invoice.actions.issue({ issuedAt: "2026-01-01T00:00:00Z" });
    expectTypeOf(issued.scope).toEqualTypeOf<"global">();
    const noted = Invoice.actions.setDraftNote({ note: "hi" });
    expectTypeOf(noted.scope).toEqualTypeOf<"local">();
  });

  it("emits no reducer callback in a finalized module declaration", () => {
    const { declaration, diagnostics } = emitDeclaration(
      [
        'import { Invoice } from "./fixtures/invoice.js";',
        "export const model = Invoice;",
        "export const creators = Invoice.actions;",
      ].join("\n"),
    );
    expect(diagnostics).toStrictEqual([]);
    expect(declaration).not.toContain("reduce(");
  });
});
