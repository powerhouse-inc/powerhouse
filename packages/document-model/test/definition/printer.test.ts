import { describe, expect, it } from "vitest";
import { ph } from "../../index.js";
import { DefinitionDiagnosticError } from "../../src/definition/diagnostics.js";
import {
  collectNamedDefinitions,
  printDescriptorSchema,
  printNamedDefinition,
  printTypeReference,
} from "../../src/definition/printer.js";
import type { ObjectDescriptor } from "../../src/definition/types.js";

describe("direct descriptor SDL printer", () => {
  it("prints the invoice review schema with no scalar declarations", () => {
    const Status = ph.enum("InvoiceStatus", {
      values: ["DRAFT", "ISSUED", "PAID", "VOID"] as const,
    });
    const LineItem = ph.object("InvoiceLineItem", {
      fields: {
        id: ph.OID({ required: true }),
        description: ph.String({ required: true }),
        quantity: ph.Int({ required: true }),
        unitPrice: ph.Money({ required: true }),
      },
    });
    const InvoiceState = ph.object("InvoiceState", {
      fields: {
        issuer: ph.PHID({ required: true }),
        number: ph.String({ required: true }),
        status: ph.ref(Status, { required: true }),
        currency: ph.Currency({ required: true }),
        lineItems: ph.list(ph.ref(LineItem, { required: true }), {
          required: true,
        }),
        issuedAt: ph.DateTime(),
        total: ph.Money({ required: true }),
      },
    });

    expect(printDescriptorSchema([InvoiceState])).toBe(
      "type InvoiceState {\n" +
        "  issuer: PHID!\n" +
        "  number: String!\n" +
        "  status: InvoiceStatus!\n" +
        "  currency: Currency!\n" +
        "  lineItems: [InvoiceLineItem!]!\n" +
        "  issuedAt: DateTime\n" +
        "  total: Amount_Money!\n" +
        "}\n\n" +
        "enum InvoiceStatus {\n" +
        "  DRAFT\n" +
        "  ISSUED\n" +
        "  PAID\n" +
        "  VOID\n" +
        "}\n\n" +
        "type InvoiceLineItem {\n" +
        "  id: OID!\n" +
        "  description: String!\n" +
        "  quantity: Int!\n" +
        "  unitPrice: Amount_Money!\n" +
        "}\n",
    );
  });

  it("preserves authored order across interfaces, computed fields, inputs, and unions", () => {
    const Paging = ph.input("PagingInput", {
      fields: { cursor: ph.String(), limit: ph.Int() },
    });
    const Node = ph.interface("Node", {
      description: "A visible node.",
      fields: { id: ph.ID({ required: true }) },
    });
    const File = ph.object("FileNode", {
      fields: { id: ph.ID({ required: true }), name: ph.String() },
      implements: [Node] as const,
    });
    const Folder = ph.object("FolderNode", {
      fields: {
        id: ph.ID({ required: true }),
        children: ph.field({
          args: { paging: ph.ref(Paging) },
          returns: ph.list(ph.ref(File, { required: true }), {
            required: true,
          }),
        }),
        label: ph.String(),
      },
      implements: [Node] as const,
    });
    const Result = ph.union("NodeResult", { members: [File, Folder] });

    const definitions = collectNamedDefinitions([Folder, Result], {
      inputUnknownKeys: "reject",
    });
    expect(definitions.map(({ name }) => name)).toEqual([
      "FolderNode",
      "Node",
      "PagingInput",
      "FileNode",
      "NodeResult",
    ]);
    expect(printDescriptorSchema([Folder, Result])).toContain(
      "children(paging: PagingInput): [FileNode!]!\n  label: String",
    );
  });

  it("terminates recursive lazy-reference traversal", () => {
    const Node: ObjectDescriptor = ph.object("RecursiveNode", {
      fields: { children: ph.list(ph.ref(() => Node)) },
    });

    expect(printDescriptorSchema([Node])).toBe(
      "type RecursiveNode {\n  children: [RecursiveNode]\n}\n",
    );
  });

  it("emits valid SDL placeholders for empty legacy-compatible types", () => {
    const EmptyNode = ph.interface("EmptyNode", { fields: {} });
    const EmptyObject = ph.object("EmptyObject", {
      fields: {},
      implements: [EmptyNode],
    });
    const EmptyInput = ph.input("EmptyInput", { fields: {} });
    const sdl = printDescriptorSchema([EmptyObject, EmptyInput]);

    expect(sdl).toContain(
      "interface EmptyNode {\n  _phEmptyEmptyNode: Boolean",
    );
    expect(sdl).toContain(
      "type EmptyObject implements EmptyNode {\n  _phEmptyEmptyNode: Boolean",
    );
    expect(sdl).toContain("input EmptyInput {\n  _phEmpty: Boolean");
  });

  it("prints metadata, defaults, directives, and recursive references from wire data", () => {
    expect(
      printNamedDefinition({
        kind: "input",
        name: "Paging",
        description: "Pagination.",
        unknownKeys: "reject",
        fields: [
          {
            key: "limit",
            name: "limit",
            description: "Maximum rows.",
            deprecated: "Use first.",
            type: { kind: "scalar", name: "Int", required: false },
            defaultValue: 25,
            directives: [
              {
                name: "tag",
                arguments: [{ name: "name", value: "stable" }],
              },
            ],
          },
        ],
      }),
    ).toBe(
      '"Pagination."\ninput Paging {\n' +
        '  "Maximum rows."\n' +
        '  limit: Int = 25 @deprecated(reason: "Use first.") @tag(name: "stable")\n' +
        "}",
    );
    expect(
      printTypeReference({
        kind: "list",
        required: true,
        item: { kind: "scalar", name: "String", required: true },
      }),
    ).toBe("[String!]!");
  });

  it("rejects duplicate names and input/output position mistakes", () => {
    const First = ph.object("Collision", { fields: { id: ph.ID() } });
    const Second = ph.object("Collision", { fields: { value: ph.String() } });
    expect(() => collectNamedDefinitions([First, Second])).toThrowError(
      DefinitionDiagnosticError,
    );

    const Input = ph.input("OnlyInput", { fields: { id: ph.ID() } });
    const BadOutput = ph.object("BadOutput", {
      fields: { input: ph.ref(Input) },
    });
    expect(() => collectNamedDefinitions([BadOutput])).toThrowError(
      DefinitionDiagnosticError,
    );
  });
});
