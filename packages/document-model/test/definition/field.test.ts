import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ph } from "../../index.js";
import { DefinitionDiagnosticError } from "../../src/definition/diagnostics.js";
import {
  toInputFieldDefinition,
  toTypeReference,
} from "../../src/definition/field.js";

function expectCode(run: () => unknown, code: `PH-${string}`): void {
  try {
    run();
    throw new Error(`Expected ${code}.`);
  } catch (error) {
    expect(error).toBeInstanceOf(DefinitionDiagnosticError);
    expect((error as DefinitionDiagnosticError).code).toBe(code);
  }
}

describe("ph descriptor algebra", () => {
  it("keeps nullability on recursive field uses", () => {
    const descriptor = ph.list(ph.list(ph.Int({ required: true })), {
      required: true,
    });

    expect(toTypeReference(descriptor)).toEqual({
      kind: "list",
      required: true,
      item: {
        kind: "list",
        required: false,
        item: { kind: "scalar", name: "Int", required: true },
      },
    });
    expect(descriptor.validator.safeParse([[1], null]).success).toBe(true);
    expect(descriptor.validator.safeParse([[1.5]]).success).toBe(false);
  });

  it("preserves unknown object keys while validating declared fields", () => {
    const Line = ph.object("Line", {
      fields: { id: ph.OID({ required: true }), note: ph.String() },
    });
    const Root = ph.object("Root", {
      fields: { line: ph.ref(Line, { required: true }) },
    });

    expect(
      Root.validator.parse({
        line: { id: "line-1", nestedExtra: true },
        rootExtra: "kept",
      }),
    ).toEqual({
      line: { id: "line-1", nestedExtra: true },
      rootExtra: "kept",
    });
    expect(Root.validator.safeParse({ line: {} }).success).toBe(false);
  });

  it("snapshots fields, enum values, and implementation tokens", () => {
    const Node = ph.interface("Node", {
      fields: { id: ph.ID({ required: true }) },
    });
    const fields = { id: ph.ID({ required: true }) };
    const File = ph.object("File", { fields, implements: [Node] as const });
    const values = ["FILE", "FOLDER"] as const;
    const Kind = ph.enum("NodeKind", { values });

    expect(Object.isFrozen(File)).toBe(true);
    expect(File.implements).toEqual([Node]);
    expect(Object.keys(File.fields)).toEqual(["id"]);
    expect(Kind.values).toEqual(["FILE", "FOLDER"]);
  });

  it("rejects accessor-backed descriptors without invoking getters", () => {
    let fieldReads = 0;
    const fields = {} as Record<string, unknown>;
    Object.defineProperty(fields, "value", {
      enumerable: true,
      get() {
        fieldReads += 1;
        return ph.String();
      },
    });
    expectCode(
      () => ph.object("AccessorFields", { fields } as never),
      "PH-DEF-FIELD-INVALID",
    );
    expect(fieldReads).toBe(0);

    let optionReads = 0;
    const options = {} as Record<string, unknown>;
    Object.defineProperty(options, "required", {
      enumerable: true,
      get() {
        optionReads += 1;
        return true;
      },
    });
    expectCode(
      () => ph.String(options as never),
      "PH-DEF-FIELD-OPTION-INVALID",
    );
    expect(optionReads).toBe(0);

    let memberReads = 0;
    const members: unknown[] = [];
    Object.defineProperty(members, 0, {
      enumerable: true,
      get() {
        memberReads += 1;
        return ph.object("AccessorMember", { fields: {} });
      },
    });
    expectCode(
      () => ph.union("AccessorUnion", { members } as never),
      "PH-DEF-FIELD-OPTION-INVALID",
    );
    expect(memberReads).toBe(0);
  });

  it("preserves prototype-shaped data keys and rejects reserved GraphQL names", () => {
    const fields = Object.create(null) as Record<string, unknown>;
    Object.defineProperties(fields, {
      constructor: { enumerable: true, value: ph.String() },
      prototype: { enumerable: true, value: ph.Boolean() },
    });
    const Safe = ph.object("PrototypeFields", { fields } as never);
    expect(Object.keys(Safe.fields)).toEqual(["constructor", "prototype"]);
    expect(Object.getPrototypeOf(Safe.fields)).toBeNull();

    const reserved = JSON.parse('{"__proto__": {}}') as Record<string, unknown>;
    reserved.__proto__ = ph.String();
    expectCode(
      () => ph.object("ReservedField", { fields: reserved } as never),
      "PH-DEF-GRAPHQL-NAME-INVALID",
    );
    expectCode(
      () => ph.String(JSON.parse('{"__proto__": true}') as never),
      "PH-DEF-FIELD-OPTION-UNSUPPORTED",
    );
  });

  it("resolves a reference thunk once and reuses its first valid target", () => {
    const First = ph.object("First", {
      fields: { first: ph.String({ required: true }) },
    });
    const Second = ph.object("Second", {
      fields: { second: ph.Int({ required: true }) },
    });
    let calls = 0;
    const reference = ph.ref(() => {
      calls += 1;
      return calls === 1 ? First : Second;
    });

    expect(toTypeReference(reference)).toMatchObject({ name: "First" });
    expect(reference.validator.safeParse({ first: "stable" }).success).toBe(
      true,
    );
    expect(reference.validator.safeParse({ second: 2 }).success).toBe(false);
    expect(calls).toBe(1);
  });

  it("does not invent defaults for ordinary descriptor fields", () => {
    const absent = ph.String();

    expect(toInputFieldDefinition("absent", absent)).not.toHaveProperty(
      "defaultValue",
    );
  });

  it("rejects unsupported field options for untyped callers", () => {
    expectCode(
      () => ph.String({ minLength: 1 } as never),
      "PH-DEF-FIELD-OPTION-UNSUPPORTED",
    );
    expectCode(
      () => ph.String({ defaultValue: null } as never),
      "PH-DEF-FIELD-OPTION-UNSUPPORTED",
    );
  });

  it("rejects named types and uncalled factories in field positions", () => {
    const Status = ph.enum("Status", ["OPEN"] as const);
    expectCode(
      () => ph.object("Bad", { fields: { status: Status } } as never),
      "PH-DEF-TYPE-AS-FIELD",
    );
    expectCode(
      () => ph.object("AlsoBad", { fields: { title: ph.String } } as never),
      "PH-SCALAR-FACTORY-AS-FIELD",
    );
  });

  it("reports malformed computed and object fields through diagnostics", () => {
    expectCode(
      () => ph.object("NullField", { fields: { value: null } } as never),
      "PH-DEF-FIELD-INVALID",
    );
    expectCode(
      () =>
        ph.object("PrimitiveField", {
          fields: { value: 1 },
        } as never),
      "PH-DEF-FIELD-INVALID",
    );
    expectCode(
      () =>
        ph.object("SpoofedComputed", {
          fields: { value: { kind: "computed-field" } },
        } as never),
      "PH-DEF-FIELD-INVALID",
    );
    expectCode(
      () =>
        ph.object("BadImplements", {
          fields: {},
          implements: {},
        } as never),
      "PH-DEF-IMPLEMENTS-TARGET-INVALID",
    );
    expectCode(
      () =>
        ph.object("SpoofedField", {
          fields: { value: { role: "field use", kind: "scalar" } },
        } as never),
      "PH-DEF-FIELD-INVALID",
    );
    expectCode(
      () =>
        ph.ref({
          role: "named type; wrap it with ph.ref(Type) to use it as a field",
          kind: "object",
          name: "Forged",
        } as never),
      "PH-DEF-REFERENCE-TARGET-INVALID",
    );
  });

  it("validates computed-field presentation strings at runtime", () => {
    expectCode(
      () =>
        ph.field({
          returns: ph.String(),
          description: 1,
        } as never),
      "PH-DEF-FIELD-OPTION-INVALID",
    );
    expectCode(
      () =>
        ph.field({
          returns: ph.String(),
          deprecated: false,
        } as never),
      "PH-DEF-FIELD-OPTION-INVALID",
    );
  });

  it("rejects duplicate enum and union members", () => {
    expectCode(
      () => ph.enum("Status", ["OPEN", "OPEN"] as const),
      "PH-DEF-ENUM-VALUE-DUPLICATE",
    );
    const Node = ph.object("Node", { fields: { id: ph.ID() } });
    expectCode(
      () => ph.union("Result", { members: [Node, Node] }),
      "PH-DEF-UNION-MEMBER-DUPLICATE",
    );
    const Interface = ph.interface("Interface", { fields: {} });
    expectCode(
      () =>
        ph.object("Implementation", {
          fields: {},
          implements: [Interface, Interface],
        }),
      "PH-DEF-IMPLEMENTS-DUPLICATE",
    );
    const EquivalentName = ph.interface("Interface", { fields: {} });
    expectCode(
      () =>
        ph.object("EquivalentImplementation", {
          fields: {},
          implements: [Interface, EquivalentName],
        }),
      "PH-DEF-IMPLEMENTS-DUPLICATE",
    );
  });

  it("keeps the shared structured-definition wire file import-free", () => {
    const directory = resolve(
      fileURLToPath(new URL(".", import.meta.url)),
      "../../../shared/document-model",
    );
    const source = readFileSync(
      resolve(directory, "definition-types.ts"),
      "utf8",
    );
    expect(source).not.toMatch(/^\s*import\s/m);
    expect(source).not.toMatch(/^\s*export\s+\{[^}]*\}\s+from\s/m);
  });
});
