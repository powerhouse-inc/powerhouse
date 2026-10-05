import { readFileSync } from "node:fs";
import { describe, expect, expectTypeOf, it } from "vitest";
import type {
  DefinitionCheckReport,
  DefinitionDiagnosticPhase,
  DefinitionSource,
  DocumentScalarReferenceDefinition,
  DocumentModelDefinition,
  DocumentModelSpecificationDefinition,
  InputFieldDefinition,
  InputTypeDefinition,
  JsonValue,
} from "./definition-types.js";

const invoiceSource: DefinitionSource = {
  specifier: "./src/document-models/invoice.ts",
  exportPath: ["invoiceFamily"],
};

const emptyDigest =
  "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

const fixture: DocumentModelDefinition = {
  kind: "powerhouse.document-model",
  formatVersion: 1,
  compatibility: {
    identity: "derived-v1",
    scalarCoercion: "document-engineering-1.40",
    serialization: "canonical-v1",
  },
  model: {
    documentType: "powerhouse/invoice",
    graphQLName: "Invoice",
    name: "Invoice",
    description: "An invoice issued to a counterparty.",
    extension: ".phinv",
    author: { name: "Powerhouse", website: "https://powerhouse.inc" },
  },
  specifications: [
    {
      version: 1,
      scalars: [
        {
          name: "PHID",
          implementation: "powerhouse.catalog#PHID",
          coercionProfile: "document-engineering-1.40",
        },
        {
          name: "OID",
          implementation: "powerhouse.catalog#OID",
          coercionProfile: "document-engineering-1.40",
        },
        {
          name: "Currency",
          implementation: "powerhouse.catalog#Currency",
          coercionProfile: "document-engineering-1.40",
        },
        {
          name: "DateTime",
          implementation: "powerhouse.catalog#DateTime",
          coercionProfile: "document-engineering-1.40",
        },
        {
          name: "Amount_Money",
          implementation: "powerhouse.catalog#Amount_Money",
          coercionProfile: "document-engineering-1.40",
        },
      ],
      graphQLCompatibility: null,
      types: [
        {
          kind: "object",
          name: "InvoiceState",
          description: null,
          fields: [
            {
              key: "issuer",
              name: "issuer",
              description: null,
              deprecated: null,
              type: { kind: "scalar", name: "PHID", required: true },
            },
            {
              key: "number",
              name: "number",
              description: null,
              deprecated: null,
              type: { kind: "scalar", name: "String", required: true },
            },
            {
              key: "status",
              name: "status",
              description: null,
              deprecated: null,
              type: { kind: "named", name: "InvoiceStatus", required: true },
            },
            {
              key: "currency",
              name: "currency",
              description: null,
              deprecated: null,
              type: { kind: "scalar", name: "Currency", required: true },
            },
            {
              key: "lineItems",
              name: "lineItems",
              description: null,
              deprecated: null,
              type: {
                kind: "list",
                required: true,
                item: {
                  kind: "named",
                  name: "InvoiceLineItem",
                  required: true,
                },
              },
            },
            {
              key: "issuedAt",
              name: "issuedAt",
              description: null,
              deprecated: null,
              type: { kind: "scalar", name: "DateTime", required: false },
            },
            {
              key: "total",
              name: "total",
              description: null,
              deprecated: null,
              type: { kind: "scalar", name: "Amount_Money", required: true },
            },
          ],
        },
        {
          kind: "enum",
          name: "InvoiceStatus",
          description: null,
          values: [
            { name: "DRAFT", description: null, deprecated: null },
            { name: "ISSUED", description: null, deprecated: null },
            { name: "PAID", description: null, deprecated: null },
            { name: "VOID", description: null, deprecated: null },
          ],
        },
        {
          kind: "object",
          name: "InvoiceLineItem",
          description: null,
          fields: [
            {
              key: "id",
              name: "id",
              description: null,
              deprecated: null,
              type: { kind: "scalar", name: "OID", required: true },
            },
            {
              key: "description",
              name: "description",
              description: null,
              deprecated: null,
              type: { kind: "scalar", name: "String", required: true },
            },
            {
              key: "quantity",
              name: "quantity",
              description: null,
              deprecated: null,
              type: { kind: "scalar", name: "Int", required: true },
            },
            {
              key: "unitPrice",
              name: "unitPrice",
              description: null,
              deprecated: null,
              type: { kind: "scalar", name: "Amount_Money", required: true },
            },
          ],
        },
        {
          kind: "object",
          name: "InvoiceLocalState",
          description: null,
          fields: [
            {
              key: "draftNote",
              name: "draftNote",
              description: null,
              deprecated: null,
              type: { kind: "scalar", name: "String", required: false },
            },
          ],
        },
      ],
      state: {
        global: {
          root: { kind: "named", name: "InvoiceState", required: true },
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
              id: "d165bf74-2083-508b-a927-8f45a153fdc7",
              key: "empty",
              value:
                '{"issuer":"","number":"","status":"DRAFT","currency":"USD","lineItems":[],"issuedAt":null,"total":0}',
            },
          ],
          unknownKeys: "preserve",
          materialized: {
            schema:
              "type InvoiceState {\n  issuer: PHID!\n  number: String!\n  status: InvoiceStatus!\n  currency: Currency!\n  lineItems: [InvoiceLineItem!]!\n  issuedAt: DateTime\n  total: Amount_Money!\n}\n\nenum InvoiceStatus {\n  DRAFT\n  ISSUED\n  PAID\n  VOID\n}\n\ntype InvoiceLineItem {\n  id: OID!\n  description: String!\n  quantity: Int!\n  unitPrice: Amount_Money!\n}\n",
            initialValue:
              '{"issuer":"","number":"","status":"DRAFT","currency":"USD","lineItems":[],"issuedAt":null,"total":0}',
            examples: [
              {
                id: "d165bf74-2083-508b-a927-8f45a153fdc7",
                value:
                  '{"issuer":"","number":"","status":"DRAFT","currency":"USD","lineItems":[],"issuedAt":null,"total":0}',
              },
            ],
          },
        },
        local: {
          root: { kind: "named", name: "InvoiceLocalState", required: true },
          initialValue: { draftNote: null },
          examples: [],
          unknownKeys: "preserve",
          materialized: {
            schema: "type InvoiceLocalState {\n  draftNote: String\n}\n",
            initialValue: '{"draftNote":null}',
            examples: [],
          },
        },
      },
      modules: [
        {
          id: "4c323bb9-fd39-5600-9af2-bc0c28489e37",
          key: "lineItems",
          name: "LineItems",
          description: "Add and remove invoice line items.",
          operations: [
            {
              id: "f9ba524d-2a61-53f3-bbd9-452ed03b7523",
              key: "addLineItem",
              name: "AddLineItem",
              description: null,
              actionType: "ADD_LINE_ITEM",
              creatorKey: "addLineItem",
              scope: "global",
              input: {
                kind: "input",
                name: "AddLineItemInput",
                description: null,
                unknownKeys: "preserve",
                fields: [
                  {
                    key: "id",
                    name: "id",
                    description: null,
                    deprecated: null,
                    type: { kind: "scalar", name: "OID", required: true },
                  },
                  {
                    key: "description",
                    name: "description",
                    description: null,
                    deprecated: null,
                    type: { kind: "scalar", name: "String", required: true },
                  },
                  {
                    key: "quantity",
                    name: "quantity",
                    description: null,
                    deprecated: null,
                    type: { kind: "scalar", name: "Int", required: true },
                  },
                  {
                    key: "unitPrice",
                    name: "unitPrice",
                    description: null,
                    deprecated: null,
                    type: {
                      kind: "scalar",
                      name: "Amount_Money",
                      required: true,
                    },
                  },
                ],
              },
              errors: [
                {
                  id: "580a9129-daff-5fd7-a92b-25a90031595d",
                  key: "InvoiceAlreadyIssued",
                  code: "INVOICE_ALREADY_ISSUED",
                  name: "InvoiceAlreadyIssued",
                  description:
                    "The invoice has left DRAFT and cannot be edited.",
                  template: "",
                },
              ],
              examples: [
                {
                  id: "7081d8a7-0cef-55ad-8d2f-99a978fdfde0",
                  key: "item",
                  value:
                    '{"id":"item-1","description":"Consulting","quantity":1,"unitPrice":100}',
                },
              ],
              template: null,
              reducer: null,
            },
          ],
        },
      ],
      changeLog: [],
    },
  ],
};

describe("DocumentModelDefinition", () => {
  const addLineItem = fixture.specifications[0].modules[0].operations[0];

  it("types the normative fixture", () => {
    expect(fixture.model.documentType).toBe("powerhouse/invoice");
    expect(fixture.specifications[0].modules[0].key).toBe("lineItems");
    expect(addLineItem.actionType).toBe("ADD_LINE_ITEM");
    expect(addLineItem.input).toMatchObject({
      kind: "input",
      name: "AddLineItemInput",
    });
    expect(addLineItem.errors[0].code).toBe("INVOICE_ALREADY_ISSUED");
    expect(addLineItem.examples[0].id).toBe(
      "7081d8a7-0cef-55ad-8d2f-99a978fdfde0",
    );
    expectTypeOf(addLineItem.input).toEqualTypeOf<InputTypeDefinition | null>();
    expectTypeOf(fixture.compatibility.identity).toEqualTypeOf<
      "derived-v1" | "explicit-schema-first"
    >();
  });

  it("rejects a function-valued property because JSON.stringify drops it", () => {
    const withFunction: DocumentModelDefinition = {
      ...fixture,
      model: {
        ...fixture.model,
        // @ts-expect-error a function is not JSON data
        name: () => "Invoice",
      },
    };
    const serialized: unknown = JSON.parse(JSON.stringify(withFunction.model));
    expect(Object.hasOwn(serialized as object, "name")).toBe(false);
    expectTypeOf<
      DocumentModelSpecificationDefinition["state"]["global"]["initialValue"]
    >().toEqualTypeOf<JsonValue>();
    // @ts-expect-error a function is not a JsonValue
    const initialValue: JsonValue = { total: () => 0 };
    expect(JSON.stringify(initialValue)).toBe("{}");
  });
});

describe("DocumentScalarReferenceDefinition", () => {
  it("ties a catalog implementation to the same Powerhouse scalar name", () => {
    expectTypeOf<
      Extract<
        DocumentScalarReferenceDefinition,
        { name: "PHID" }
      >["implementation"]
    >().toEqualTypeOf<"powerhouse.catalog#PHID">();
    expectTypeOf<
      Extract<DocumentScalarReferenceDefinition, { name: "String" }>
    >().toEqualTypeOf<never>();

    // @ts-expect-error implementation must identify the same catalog scalar
    const mismatched: DocumentScalarReferenceDefinition = {
      name: "PHID",
      implementation: "powerhouse.catalog#OID",
      coercionProfile: "document-engineering-1.40",
    };
    expect(mismatched.name).toBe("PHID");
  });
});

describe("DefinitionCheckReport", () => {
  const okReport: DefinitionCheckReport = {
    kind: "powerhouse.definition-check",
    formatVersion: 1,
    profile: "edit",
    sourceSet: {
      mode: "code-first",
      origin: "config",
      digest: emptyDigest,
      sources: [invoiceSource],
    },
    definitions: [
      {
        kind: "document-model",
        key: "powerhouse/invoice",
        version: 1,
        digest: emptyDigest,
        source: invoiceSource,
      },
    ],
    diagnostics: [],
    summary: { errors: 0, warnings: 0 },
    status: "ok",
  };

  const skippedReport: DefinitionCheckReport = {
    kind: "powerhouse.definition-check",
    formatVersion: 1,
    profile: "release",
    sourceSet: {
      mode: "schema-first",
      origin: "config",
      digest: emptyDigest,
      sources: [],
    },
    definitions: [],
    diagnostics: [],
    summary: { errors: 0, warnings: 0 },
    status: "skipped",
    skipReason: "explicit-schema-first-mode",
  };

  it("records the executed profile", () => {
    expect(okReport.profile).toBe("edit");
    expect(skippedReport.profile).toBe("release");
    expectTypeOf<DefinitionCheckReport["profile"]>().toEqualTypeOf<
      "edit" | "release"
    >();
  });

  it("pins the skip reason to the schema-first spelling", () => {
    expect(skippedReport.skipReason).toBe("explicit-schema-first-mode");
    expectTypeOf<
      Extract<DefinitionCheckReport, { status: "skipped" }>["skipReason"]
    >().toEqualTypeOf<"explicit-schema-first-mode">();
  });

  it("requires skipReason when status is skipped", () => {
    // @ts-expect-error status "skipped" requires skipReason
    const skippedWithoutReason: DefinitionCheckReport = {
      kind: "powerhouse.definition-check",
      formatVersion: 1,
      profile: "release",
      sourceSet: {
        mode: "schema-first",
        origin: "config",
        digest: emptyDigest,
        sources: [],
      },
      definitions: [],
      diagnostics: [],
      summary: { errors: 0, warnings: 0 },
      status: "skipped",
    };
    expect(skippedWithoutReason.status).toBe("skipped");
  });

  it("forbids skipReason when status is ok", () => {
    const okWithReason: DefinitionCheckReport = {
      kind: "powerhouse.definition-check",
      formatVersion: 1,
      profile: "edit",
      sourceSet: {
        mode: "code-first",
        origin: "config",
        digest: emptyDigest,
        sources: [invoiceSource],
      },
      definitions: [],
      diagnostics: [],
      summary: { errors: 0, warnings: 0 },
      status: "ok",
      // @ts-expect-error skipReason is only allowed with status "skipped"
      skipReason: "explicit-schema-first-mode",
    };
    expect(okWithReason.status).toBe("ok");
  });

  it("requires the executed profile", () => {
    // @ts-expect-error profile is required on every report
    const withoutProfile: DefinitionCheckReport = {
      kind: "powerhouse.definition-check",
      formatVersion: 1,
      sourceSet: {
        mode: "code-first",
        origin: "config",
        digest: emptyDigest,
        sources: [invoiceSource],
      },
      definitions: [],
      diagnostics: [],
      summary: { errors: 0, warnings: 0 },
      status: "ok",
    };
    expect(withoutProfile.status).toBe("ok");
  });
});

describe("DefinitionSource", () => {
  it("requires a package-relative specifier starting with ./", () => {
    expect(invoiceSource.specifier.startsWith("./")).toBe(true);
    expectTypeOf<
      DefinitionSource["specifier"]
    >().toEqualTypeOf<`./${string}`>();
    // @ts-expect-error specifier must start with "./"
    const outside: DefinitionSource = { specifier: "src/models.ts" };
    expect(outside.specifier.startsWith("./")).toBe(false);
  });
});

describe("DefinitionDiagnosticPhase", () => {
  it("is the closed eight-member union from the spec", () => {
    expectTypeOf<DefinitionDiagnosticPhase>().toEqualTypeOf<
      | "configuration"
      | "import"
      | "definition"
      | "composition"
      | "authorization"
      | "typecheck"
      | "package"
      | "replay"
    >();
  });
});

describe("InputFieldDefinition", () => {
  const absent: InputFieldDefinition = {
    key: "quantity",
    name: "quantity",
    description: null,
    deprecated: null,
    type: { kind: "scalar", name: "Int", required: true },
  };

  const authoredNull: InputFieldDefinition = {
    key: "quantity",
    name: "quantity",
    description: null,
    deprecated: null,
    type: { kind: "scalar", name: "Int", required: false },
    defaultValue: null,
  };

  it("serializes an absent default without a defaultValue property", () => {
    expect(JSON.stringify(absent)).not.toContain("defaultValue");
  });

  it("serializes an authored null default as defaultValue null", () => {
    expect(JSON.stringify(authoredNull)).toContain('"defaultValue":null');
  });

  it("never serializes a hasDefaultValue discriminant", () => {
    expect(JSON.stringify(absent)).not.toContain("hasDefaultValue");
    expect(JSON.stringify(authoredNull)).not.toContain("hasDefaultValue");
  });

  it("rejects hasDefaultValue as an unknown property", () => {
    const withFlag: InputFieldDefinition = {
      key: "quantity",
      name: "quantity",
      description: null,
      deprecated: null,
      type: { kind: "scalar", name: "Int", required: true },
      // @ts-expect-error hasDefaultValue is not a wire property
      hasDefaultValue: false,
    };
    expect(JSON.stringify(withFlag)).toContain("hasDefaultValue");
  });
});

describe("definition-types.ts source", () => {
  const source = readFileSync(
    new URL("./definition-types.ts", import.meta.url),
    "utf8",
  );

  it("imports nothing", () => {
    expect(source).not.toMatch(/^import\b/m);
  });

  it("exports types only", () => {
    expect(source).not.toMatch(
      /^export (const|function|class|enum|let|var|default)\b/m,
    );
    expect(source).not.toMatch(/^export (?!type\b)/m);
  });

  it("names neither graphql nor zod as a module specifier", () => {
    expect(source).not.toContain('"graphql"');
    expect(source).not.toContain('"zod"');
    expect(source).not.toMatch(/from "(graphql|zod)/);
  });

  it("has no V1-suffixed type name", () => {
    expect(source).not.toMatch(/^export type \w*V1\b/m);
  });
});
