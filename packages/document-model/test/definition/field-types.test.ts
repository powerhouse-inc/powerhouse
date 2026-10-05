import ts from "typescript";
import { describe, expect, expectTypeOf, it } from "vitest";
import {
  isFieldDescriptor,
  isTypeDescriptor,
} from "../../src/definition/descriptor-registry.js";
import { DocumentModelDefinitionError } from "../../src/definition/diagnostics.js";
import { ph } from "../../src/definition/field.js";
import {
  type AnyFieldDescriptor,
  type AnyTypeDescriptor,
  FIELD_USE_ROLE,
  type InputObjectOf,
  NAMED_TYPE_ROLE,
  type ObjectFields,
  type OutputObjectOf,
  type OutputOf,
  type StateRootDescriptor,
} from "../../src/definition/types.js";

const InvoiceStatus = ph.enum("InvoiceStatus", {
  values: ["DRAFT", "ISSUED", "PAID"],
});
const LineItem = ph.object("InvoiceLineItem", {
  fields: {
    id: ph.OID({ required: true }),
    quantity: ph.Int({ required: true }),
    note: ph.String(),
  },
});

describe("the named-type / field-use split", () => {
  it("rejects the four declarations that one descriptor type let through", () => {
    const fields: ObjectFields = {
      // @ts-expect-error a named type in a field slot
      status: InvoiceStatus,
    };
    expect(Object.keys(fields)).toStrictEqual(["status"]);
    expectTypeOf(ph.union).parameter(1).toHaveProperty("members");
    expectTypeOf<
      Parameters<typeof ph.union>[1]["members"][number]
    >().not.toMatchTypeOf<ReturnType<typeof ph.String>>();
    expectTypeOf(ph.ref)
      .parameter(0)
      .not.toMatchTypeOf<ReturnType<typeof ph.ref>>();
    expectTypeOf(ph.list).parameter(0).not.toMatchTypeOf<typeof LineItem>();
  });

  it("keeps the four correct declarations compiling", () => {
    const _statusField = ph.ref(InvoiceStatus, { required: true });
    const _lazy = ph.ref(() => LineItem);
    const _items = ph.list(ph.ref(LineItem, { required: true }), {
      required: true,
    });
    const Node = ph.union("Node", { members: [LineItem] });
    expectTypeOf<OutputOf<typeof _statusField>>().toEqualTypeOf<
      "DRAFT" | "ISSUED" | "PAID"
    >();
    expectTypeOf<OutputOf<typeof _lazy>>().toEqualTypeOf<
      | { id: string; quantity: number; note: string | null | undefined }
      | null
      | undefined
    >();
    expectTypeOf<OutputOf<typeof _items>>().toEqualTypeOf<
      readonly {
        id: string;
        quantity: number;
        note: string | null | undefined;
      }[]
    >();
    expect(Node.members).toStrictEqual([LineItem]);
  });

  it("makes required fields required input keys and nullable fields optional ones", () => {
    type Fields = typeof LineItem.fields;
    expectTypeOf<InputObjectOf<Fields>>().toEqualTypeOf<
      { id: string; quantity: number } & { note?: string | null | undefined }
    >();
    expectTypeOf<OutputObjectOf<Fields>>().toEqualTypeOf<{
      id: string;
      quantity: number;
      note: string | null | undefined;
    }>();
  });

  it("narrows a state root to a ph.object without a new builder", () => {
    const root: StateRootDescriptor = LineItem;
    expect(root.kind).toBe("object");
    // @ts-expect-error an enum is not a state root
    const notRoot: StateRootDescriptor = InvoiceStatus;
    expect(notRoot.kind).toBe("enum");
  });
});

describe("role literals", () => {
  it("are the exact repair-carrying strings", () => {
    expect(FIELD_USE_ROLE).toBe("field use");
    expect(NAMED_TYPE_ROLE).toBe(
      "named type; wrap it with ph.ref(Type) to use it as a field",
    );
    expect(ph.String().role).toBe("field use");
    expect(ph.list(ph.String()).role).toBe("field use");
    expect(ph.ref(LineItem).role).toBe("field use");
    expect(InvoiceStatus.role).toBe(
      "named type; wrap it with ph.ref(Type) to use it as a field",
    );
    expect(LineItem.role).toBe(
      "named type; wrap it with ph.ref(Type) to use it as a field",
    );
    expect(ph.OID.role).toBe(
      "field-use factory; call it, as ph.OID({ required: true })",
    );
    expect(ph.Money.role).toBe(
      "field-use factory; call it, as ph.Money({ required: true })",
    );
  });
});

describe("descriptor registry", () => {
  it("rejects a hand-forged object that copies the role string", () => {
    const forgedField = {
      ...ph.String(),
      role: "field use",
    } as unknown as AnyFieldDescriptor;
    const forgedType = {
      ...InvoiceStatus,
      role: NAMED_TYPE_ROLE,
    } as unknown as AnyTypeDescriptor;
    expect(isFieldDescriptor(forgedField)).toBe(false);
    expect(isTypeDescriptor(forgedType)).toBe(false);
    expect(isFieldDescriptor(ph.String())).toBe(true);
    expect(isTypeDescriptor(InvoiceStatus)).toBe(true);
    let caught: unknown;
    try {
      ph.object("Forged", { fields: { a: forgedField } });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(DocumentModelDefinitionError);
    expect(
      (caught as DocumentModelDefinitionError).diagnostics[0],
    ).toMatchObject({
      code: "PH-DEF-FIELD-INVALID",
      path: ["options", "fields", "a"],
    });
  });
});

describe("type instantiation budget", () => {
  it("records the instantiation count of a 300-field object for later comparison", () => {
    const fields = Array.from({ length: 300 }, (_, index) => {
      const use =
        index % 3 === 0
          ? "ph.String({ required: true })"
          : index % 3 === 1
            ? "ph.list(ph.ref(() => LineItem))"
            : "ph.ref(InvoiceStatus, { required: true })";
      return `  f${index}: ${use},`;
    }).join("\n");
    const source = [
      'import { ph } from "../../src/definition/field.js";',
      'const InvoiceStatus = ph.enum("InvoiceStatus", { values: ["A", "B"] });',
      'const LineItem = ph.object("LineItem", { fields: { id: ph.OID({ required: true }) } });',
      'export const Big = ph.object("Big", { fields: {',
      fields,
      "} });",
      "export type BigOutput = typeof Big.fields;",
    ].join("\n");
    const fixturePath = new URL("./instantiation-fixture.ts", import.meta.url)
      .pathname;
    const host = ts.createCompilerHost({}, true);
    const readFile = host.readFile.bind(host);
    const fileExists = host.fileExists.bind(host);
    host.readFile = (fileName) =>
      fileName === fixturePath ? source : readFile(fileName);
    host.fileExists = (fileName) =>
      fileName === fixturePath ? true : fileExists(fileName);
    const configPath = new URL("../../tsconfig.json", import.meta.url).pathname;
    const config = ts.getParsedCommandLineOfConfigFile(
      configPath,
      {},
      {
        ...ts.sys,
        onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
          throw new Error(
            ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
          );
        },
      },
    );
    if (config === undefined) throw new Error("tsconfig.json did not parse");
    const program = ts.createProgram(
      [fixturePath],
      {
        ...config.options,
        noEmit: true,
        composite: false,
        incremental: false,
        declaration: false,
        emitDeclarationOnly: false,
      },
      host,
    );
    const fixture = program.getSourceFile(fixturePath);
    if (fixture === undefined) throw new Error("fixture was not loaded");
    const diagnostics = program.getSemanticDiagnostics(fixture);
    expect(
      diagnostics.map((diagnostic) =>
        ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
      ),
    ).toStrictEqual([]);
    const count = program.getInstantiationCount();
    console.info(`type instantiations for a 300-field object: ${count}`);
    expect(count).toBeGreaterThan(0);
  });
});
