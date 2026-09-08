import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createAction,
  defineDocumentModel,
  defineDocumentModelFamily,
  DocumentModelDefinitionError,
  ph,
  type ActionOf,
  type GlobalStateOf,
  type LocalStateOf,
  type UpgradeTransition,
} from "../../index.js";
import { CodeFirstDocumentModelSourceAdapter } from "../../src/definition/adapters/index.js";

const repositoryRoot = resolve(
  fileURLToPath(new URL(".", import.meta.url)),
  "../../../..",
);

const InvoiceStatus = ph.enum("InvoiceStatus", {
  values: ["DRAFT", "ISSUED", "PAID", "VOID"] as const,
});

const InvoiceLineItem = ph.object("InvoiceLineItem", {
  fields: {
    id: ph.OID({ required: true }),
    description: ph.String({ required: true }),
    quantity: ph.Int({ required: true }),
    unitPrice: ph.Money({ required: true }),
  },
});

const invoice = defineDocumentModel({
  id: "powerhouse/invoice",
  name: "Invoice",
  description: "An invoice issued to a counterparty.",
  extension: ".phinv",
  version: 1,
  author: { name: "Powerhouse", website: "https://powerhouse.inc" },
  changeLog: [],
  specifications: {
    global: {
      schema: ph.object("InvoiceState", {
        fields: {
          issuer: ph.PHID({ required: true }),
          number: ph.String({ required: true }),
          status: ph.ref(InvoiceStatus, { required: true }),
          currency: ph.Currency({ required: true }),
          lineItems: ph.list(ph.ref(InvoiceLineItem, { required: true }), {
            required: true,
          }),
          issuedAt: ph.DateTime(),
          total: ph.Money({ required: true }),
        },
      }),
      initialValue: {
        issuer: "",
        number: "",
        status: "DRAFT",
        currency: "USD",
        lineItems: [],
        issuedAt: null,
        total: 0,
      },
      examples: [
        {
          key: "empty",
          value:
            '{"issuer":"","number":"","status":"DRAFT","currency":"USD","lineItems":[],"issuedAt":null,"total":0}',
        },
      ],
    },
    local: {
      schema: ph.object("InvoiceLocalState", {
        fields: { draftNote: ph.String() },
      }),
      initialValue: { draftNote: null },
      examples: [],
    },
  },
});

const lineItems = invoice.module("lineItems", {
  description: "Add and remove invoice line items.",
  operations: ({ global }) => ({
    addLineItem: global({
      input: ph.input({
        fields: {
          id: ph.OID({ required: true }),
          description: ph.String({ required: true }),
          quantity: ph.Int({ required: true }),
          unitPrice: ph.Money({ required: true }),
        },
      }),
      errors: {
        InvoiceAlreadyIssued: {
          code: "INVOICE_ALREADY_ISSUED",
          description: "The invoice has left DRAFT and cannot be edited.",
          template: "",
        },
      },
      examples: [
        {
          key: "item",
          value:
            '{"id":"item-1","description":"Consulting","quantity":1,"unitPrice":100}',
        },
      ],
      template: null,
      reducerTemplate: null,
      reduce(state, input, context) {
        if (state.status !== "DRAFT") {
          throw new context.errors.InvoiceAlreadyIssued(
            `Invoice ${state.number} has already been issued`,
          );
        }
        state.lineItems.push(input);
        state.total = state.lineItems.reduce(
          (sum, item) => sum + item.quantity * item.unitPrice,
          0,
        );
      },
    }),
  }),
});

const InvoiceV1 = invoice.finalize({ modules: [lineItems] });

describe("defineDocumentModel", () => {
  it("matches the normative structured invoice definition", () => {
    const expected: unknown = JSON.parse(
      readFileSync(
        resolve(
          repositoryRoot,
          "cf-spec/fixtures/v1/document-model-definition.json",
        ),
        "utf8",
      ),
    );
    expect(InvoiceV1.definition).toEqual(expected);
  });

  it("normalizes finalized sources without parsing stored SDL", () => {
    const adapter = new CodeFirstDocumentModelSourceAdapter();
    const normalized = adapter.adapt(InvoiceV1);
    expect(normalized.documentType).toBe("powerhouse/invoice");
    expect(normalized.version).toBe(1);
    expect(normalized.definition).toEqual(InvoiceV1.definition);
    expect(normalized.definition).not.toBe(InvoiceV1.definition);
    expect(normalized.digest).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("materializes ordinary legacy-compatible actions, reducer, and utils", () => {
    const document = InvoiceV1.utils.createDocument();
    const input = {
      id: "item-1",
      description: "Consulting",
      quantity: 2,
      unitPrice: 100,
      retainedUnknownKey: true,
    };
    const action = InvoiceV1.actions.addLineItem(input);

    expect(action.type).toBe("ADD_LINE_ITEM");
    expect(action.scope).toBe("global");
    expect(action.input).not.toBe(input);
    expect(action.input).toEqual(input);

    const result = InvoiceV1.reducer(document, action);
    expect(result.state.global.lineItems).toEqual([input]);
    expect(result.state.global.total).toBe(200);
    expect(InvoiceV1.utils.isStateOfType(result.state)).toBe(true);
    expect(InvoiceV1.utils.isDocumentOfType(result)).toBe(true);
    expect(InvoiceV1.documentModel.global.specifications).toHaveLength(1);
  });

  it("validates creator input and independently validates raw reducer input", () => {
    expect(() =>
      InvoiceV1.actions.addLineItem({
        id: "item-1",
        description: "Consulting",
        quantity: 1.5,
        unitPrice: 100,
      }),
    ).toThrow("Invalid action input");

    const raw = createAction("ADD_LINE_ITEM", {
      id: "item-1",
      description: "Consulting",
      quantity: 1.5,
      unitPrice: 100,
    });
    const result = InvoiceV1.reducer(InvoiceV1.utils.createDocument(), raw);
    expect(result.operations.global.at(-1)?.error).toBeTruthy();
    expect(result.state.global.lineItems).toEqual([]);
  });

  it("uses reducer-facing error keys for runtime error behavior", () => {
    const document = InvoiceV1.utils.createDocument({
      global: {
        issuer: "",
        number: "INV-1",
        status: "ISSUED",
        currency: "USD",
        lineItems: [],
        issuedAt: null,
        total: 0,
      },
    });
    const action = InvoiceV1.actions.addLineItem({
      id: "item-1",
      description: "Consulting",
      quantity: 1,
      unitPrice: 100,
    });
    const result = InvoiceV1.reducer(document, action);
    const operation = result.operations.global.at(-1);
    expect(operation?.error).toBe("Invoice INV-1 has already been issued");
  });

  it("exposes inferred helper types without reducer callback internals", () => {
    type Global = GlobalStateOf<typeof InvoiceV1>;
    type Local = LocalStateOf<typeof InvoiceV1>;
    type ModelAction = ActionOf<typeof InvoiceV1>;
    expectTypeOf<Global["status"]>().toEqualTypeOf<
      "DRAFT" | "ISSUED" | "PAID" | "VOID"
    >();
    expectTypeOf<Local["draftNote"]>().toEqualTypeOf<
      string | null | undefined
    >();
    expectTypeOf<ModelAction>().toMatchTypeOf<{ type: string }>();
  });

  it("reports malformed version configuration through public diagnostics", () => {
    expect(() => invoice.version(null as never)).toThrow(
      DocumentModelDefinitionError,
    );
    expect(() => invoice.version({ modules: null } as never)).toThrow(
      DocumentModelDefinitionError,
    );
    expect(() => invoice.finalize({ modules: {} } as never)).toThrow(
      DocumentModelDefinitionError,
    );
    expect(() =>
      invoice.module("forgedInput", {
        operations: ({ global }) => ({
          forged: global({
            input: {
              role: "named type; wrap it with ph.ref(Type) to use it as a field",
              kind: "input",
              name: "ForgedInput",
            },
            reduce() {},
          } as never),
        }),
      }),
    ).toThrow(DocumentModelDefinitionError);
  });
});

describe("defineDocumentModelFamily", () => {
  it("reports malformed family configuration through public diagnostics", () => {
    expect(() => defineDocumentModelFamily(null as never)).toThrow(
      DocumentModelDefinitionError,
    );
    expect(() =>
      defineDocumentModelFamily({ versions: [], upgrades: null } as never),
    ).toThrow(DocumentModelDefinitionError);
    expect(() =>
      defineDocumentModelFamily({
        versions: [{}],
        upgrades: {},
      } as never),
    ).toThrow(DocumentModelDefinitionError);
  });

  it("materializes complete independent specification histories", () => {
    const todoV1 = defineDocumentModel({
      id: "test/code-first-todo",
      name: "Code First Todo",
      description: "Family test",
      extension: "todo",
      version: 1,
      author: { name: "Powerhouse" },
      specifications: {
        global: {
          schema: ph.object("CodeFirstTodoState", {
            fields: {
              todos: ph.list(ph.String({ required: true }), { required: true }),
            },
          }),
          initialValue: { todos: [] },
        },
        local: { schema: null, initialValue: {} },
      },
    });
    const todoV2 = defineDocumentModel({
      id: "test/code-first-todo",
      name: "Code First Todo",
      description: "Family test",
      extension: "todo",
      version: 2,
      author: { name: "Powerhouse" },
      specifications: {
        global: {
          schema: ph.object("CodeFirstTodoState", {
            fields: {
              todos: ph.list(ph.String({ required: true }), { required: true }),
              title: ph.String(),
            },
          }),
          initialValue: { todos: [], title: null },
        },
        local: { schema: null, initialValue: {} },
      },
    });
    const v1Definition = todoV1.version({ modules: [] });
    const v2Definition = todoV2.version({ modules: [] });
    const upgrade: UpgradeTransition = {
      toVersion: 2,
      upgradeReducer(document) {
        return document;
      },
    };
    const family = defineDocumentModelFamily({
      versions: [v1Definition, v2Definition],
      upgrades: [upgrade],
    });

    expect(family.modules.map((module) => module.version)).toEqual([1, 2]);
    expect(
      family.modules.map(
        (module) => module.documentModel.global.specifications.length,
      ),
    ).toEqual([2, 2]);
    expect(family.at(1)).toBe(family.modules[0]);
    expect(family.at(2)).toBe(family.modules[1]);
    expect(family.modules[0].definition).not.toBe(family.modules[1].definition);
    family.modules[0]!.documentModel.global.specifications[0]!.changeLog.push(
      "mutated",
    );
    expect(
      family.modules[1]!.documentModel.global.specifications[0]!.changeLog,
    ).toEqual([]);
  });

  it("rejects non-contiguous family versions", () => {
    const makeVersion = (version: number) => {
      const context = defineDocumentModel({
        id: "test/gapped",
        name: "Gapped",
        description: "Gap test",
        extension: "gap",
        version,
        author: { name: "Powerhouse" },
        specifications: {
          global: {
            schema: ph.object("GappedState", { fields: {} }),
            initialValue: {},
          },
          local: { schema: null, initialValue: {} },
        },
      });
      return context.version({ modules: [] });
    };

    expect(() =>
      defineDocumentModelFamily({
        versions: [makeVersion(1), makeVersion(3)],
        upgrades: [{ toVersion: 3, upgradeReducer: (document) => document }],
      }),
    ).toThrow(DocumentModelDefinitionError);
  });
});
