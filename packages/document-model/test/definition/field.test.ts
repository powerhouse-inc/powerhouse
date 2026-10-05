import type { DefinitionDiagnostic } from "@powerhousedao/shared/document-model";
import { describe, expect, expectTypeOf, it } from "vitest";
import { DocumentModelDefinitionError } from "../../src/definition/diagnostics.js";
import { nameAnonymousInput, ph } from "../../src/definition/field.js";
import type {
  GraphQLIdentity,
  InputObjectOf,
  OutputOf,
} from "../../src/definition/types.js";
import { resolveReference } from "../../src/definition/zod.js";

function rejection(action: () => unknown): DefinitionDiagnostic {
  try {
    action();
  } catch (error) {
    if (error instanceof DocumentModelDefinitionError) {
      expect(error.diagnostics).toHaveLength(1);
      return error.diagnostics[0];
    }
    throw error;
  }
  throw new Error("expected a definition rejection");
}

function deepFrozen(value: unknown, seen = new Set<object>()): boolean {
  if (typeof value !== "object" || value === null || seen.has(value))
    return true;
  seen.add(value);
  if (!Object.isFrozen(value)) return false;
  return Object.entries(value).every(([key, member]) =>
    typeof member === "function" ||
    key === "validator" ||
    key === "baseValidator"
      ? true
      : deepFrozen(member, seen),
  );
}

describe("scalar factories", () => {
  it("print nullable by default and non-null with required", () => {
    expect(ph.String().identity).toStrictEqual({
      kind: "scalar",
      name: "String",
      required: false,
    });
    expect(ph.String({ required: true }).identity).toStrictEqual({
      kind: "scalar",
      name: "String",
      required: true,
    });
    expect(ph.String({ required: false }).required).toBe(false);
    expect(ph.Money().identity).toStrictEqual({
      kind: "scalar",
      name: "Amount_Money",
      required: false,
    });
    expectTypeOf(ph.String({ required: true }).required).toEqualTypeOf<true>();
    expectTypeOf(ph.String().required).toEqualTypeOf<false>();
    expectTypeOf<OutputOf<ReturnType<typeof ph.Int>>>().toEqualTypeOf<
      number | null | undefined
    >();
  });

  it("exposes every catalog member and built-in under its builder name", () => {
    const builders = [
      "ID",
      "String",
      "Boolean",
      "Int",
      "Float",
      "PHID",
      "OID",
      "OLabel",
      "Currency",
      "EmailAddress",
      "EthereumAddress",
      "URL",
      "Date",
      "DateTime",
      "Money",
      "Percentage",
      "Tokens",
      "Amount",
      "AmountFiat",
      "AmountCrypto",
      "AmountCurrency",
      "Upload",
      "Address",
      "AttachmentRef",
      "Unknown",
      "JSONObject",
    ] as const;
    for (const builder of builders) {
      expect(typeof ph[builder], builder).toBe("function");
      expect(ph[builder]().kind, builder).toBe("scalar");
    }
    expect(ph.Money().scalarName).toBe("Amount_Money");
    expect(ph.AmountFiat().scalarName).toBe("Amount_Fiat");
    expect(Object.isFrozen(ph)).toBe(true);
  });

  it("keeps built-in validators aligned with generated Zod", () => {
    expect(ph.Int({ required: true }).validator.safeParse(1.5).success).toBe(
      true,
    );
    expect(ph.Int({ required: true }).validator.safeParse("1").success).toBe(
      false,
    );
    expect(ph.ID({ required: true }).validator.safeParse(1).success).toBe(
      false,
    );
    expect(
      ph.Boolean({ required: true }).validator.safeParse(false).success,
    ).toBe(true);
  });

  const unsupported = [
    "minLength",
    "maxLength",
    "pattern",
    "format",
    "min",
    "max",
    "exclusiveMin",
    "exclusiveMax",
    "multipleOf",
    "minItems",
    "maxItems",
    "nullable",
  ];

  it.each(unsupported)("rejects the %s option by name", (option) => {
    const diagnostic = rejection(() =>
      ph.String({ [option]: 1 } as unknown as { required?: boolean }),
    );
    expect(diagnostic).toMatchObject({
      code: "PH-DEF-FIELD-OPTION-UNSUPPORTED",
      path: ["options", option],
      received: option,
    });
    expect(diagnostic.repair).toContain("required");
  });

  it("rejects an unknown option on lists and references too", () => {
    expect(
      rejection(() => ph.list(ph.String(), { minItems: 1 } as never)).code,
    ).toBe("PH-DEF-FIELD-OPTION-UNSUPPORTED");
    const Status = ph.enum("Status", { values: ["A"] });
    expect(
      rejection(() => ph.ref(Status, { pattern: "x" } as never)).received,
    ).toBe("pattern");
  });

  it("rejects a non-boolean required and unstable option objects", () => {
    expect(
      rejection(() => ph.String({ required: "yes" as unknown as boolean })),
    ).toMatchObject({
      code: "PH-DEF-OPTION-INVALID",
      path: ["options", "required"],
    });
    let invoked = false;
    const options = {
      get required() {
        invoked = true;
        return true;
      },
    };
    expect(rejection(() => ph.String(options)).code).toBe(
      "PH-DEF-OPTION-INVALID",
    );
    expect(invoked).toBe(false);
  });
});

describe("presentation metadata", () => {
  it("is retained on scalar, list, and reference uses", () => {
    const field = ph.String({
      description: "A note.",
      deprecated: "Use memo.",
      defaultValue: null,
    });
    expect(field.presentation).toStrictEqual({
      description: "A note.",
      deprecated: "Use memo.",
      default: { present: true, value: null },
    });
    expect(
      ph.list(ph.Int(), { description: "Counts." }).presentation,
    ).toMatchObject({
      description: "Counts.",
      deprecated: null,
      default: { present: false },
    });
    const Status = ph.enum("Status", { values: ["A"] });
    expect(
      ph.ref(Status, { defaultValue: "A" }).presentation.default,
    ).toStrictEqual({
      present: true,
      value: "A",
    });
  });

  it("keeps an omitted default, an authored null, and an authored undefined apart", () => {
    expect(ph.String().presentation.default).toStrictEqual({ present: false });
    expect(
      ph.String({ defaultValue: null }).presentation.default,
    ).toStrictEqual({
      present: true,
      value: null,
    });
    expect(
      rejection(() => ph.String({ defaultValue: undefined })),
    ).toMatchObject({
      code: "PH-DEF-OPTION-INVALID",
      path: ["options", "defaultValue"],
      received: "undefined",
    });
  });

  it("rejects a default that is not JSON and non-string descriptions", () => {
    expect(
      rejection(() => ph.String({ defaultValue: () => 1 } as never)).path,
    ).toStrictEqual(["options", "defaultValue"]);
    expect(
      rejection(() => ph.String({ description: 1 } as never)),
    ).toMatchObject({
      code: "PH-DEF-OPTION-INVALID",
      path: ["options", "description"],
    });
  });

  it("rejects metadata on a list item, where GraphQL has no definition to carry it", () => {
    expect(
      rejection(() => ph.list(ph.String({ description: "item" }))),
    ).toMatchObject({
      code: "PH-DEF-OPTION-INVALID",
      path: ["item", "options", "description"],
    });
    expect(
      rejection(() => ph.list(ph.String({ defaultValue: null }))).received,
    ).toBe("defaultValue");
    expect(
      ph.list(ph.String(), { description: "outer" }).presentation.description,
    ).toBe("outer");
  });
});

describe("ph.list", () => {
  const item = (identity: GraphQLIdentity): GraphQLIdentity => identity;

  it("expresses nesting and nullability by recursion alone", () => {
    const cases: readonly [string, GraphQLIdentity, GraphQLIdentity][] = [
      [
        "[String]",
        ph.list(ph.String()).identity,
        item({
          kind: "list",
          required: false,
          item: { kind: "scalar", name: "String", required: false },
        }),
      ],
      [
        "[String!]",
        ph.list(ph.String({ required: true })).identity,
        item({
          kind: "list",
          required: false,
          item: { kind: "scalar", name: "String", required: true },
        }),
      ],
      [
        "[String]!",
        ph.list(ph.String(), { required: true }).identity,
        item({
          kind: "list",
          required: true,
          item: { kind: "scalar", name: "String", required: false },
        }),
      ],
      [
        "[String!]!",
        ph.list(ph.String({ required: true }), { required: true }).identity,
        item({
          kind: "list",
          required: true,
          item: { kind: "scalar", name: "String", required: true },
        }),
      ],
      [
        "[[Int!]]",
        ph.list(ph.list(ph.Int({ required: true }))).identity,
        item({
          kind: "list",
          required: false,
          item: {
            kind: "list",
            required: false,
            item: { kind: "scalar", name: "Int", required: true },
          },
        }),
      ],
    ];
    for (const [label, actual, expected] of cases) {
      expect(actual, label).toStrictEqual(expected);
    }
    const _nested = ph.list(ph.list(ph.Int({ required: true })));
    expectTypeOf<OutputOf<typeof _nested>>().toEqualTypeOf<
      readonly (readonly number[] | null | undefined)[] | null | undefined
    >();
  });

  it("rejects a named type, a factory, and a non-descriptor as its item", () => {
    const Status = ph.enum("Status", { values: ["A"] });
    expect(rejection(() => ph.list(Status as never))).toMatchObject({
      code: "PH-DEF-TYPE-AS-FIELD",
      path: ["item"],
    });
    expect(rejection(() => ph.list(ph.String as never))).toMatchObject({
      code: "PH-SCALAR-FACTORY-AS-FIELD",
      repair: "ph.String({ required: true })",
    });
    expect(rejection(() => ph.list("String" as never)).code).toBe(
      "PH-DEF-FIELD-INVALID",
    );
  });
});

describe("ph.ref", () => {
  const Status = ph.enum("Status", { values: ["A", "B"] });

  it("references named types by token and keeps nullability on the use", () => {
    const optional = ph.ref(Status);
    const required = ph.ref(Status, { required: true });
    expect(optional.identity).toStrictEqual({ kind: "ref", required: false });
    expect(required.identity).toStrictEqual({ kind: "ref", required: true });
    expect(resolveReference(optional)).toBe(Status);
    expect(optional.validator.safeParse("A").success).toBe(true);
    expect(optional.validator.safeParse(null).success).toBe(true);
    expect(required.validator.safeParse(null).success).toBe(false);
    expect(required.validator.safeParse("C").success).toBe(false);
  });

  it("resolves a thunk lazily, once, and keeps the target's identity", () => {
    let calls = 0;
    const lazy = ph.ref(() => {
      calls += 1;
      return Status;
    });
    expect(calls).toBe(0);
    expect(resolveReference(lazy)).toBe(Status);
    expect(resolveReference(lazy)).toBe(Status);
    expect(lazy.validator.safeParse("B").success).toBe(true);
    expect(calls).toBe(1);
  });

  it("builds a mutually recursive pair without overflow and validates finite values", () => {
    type Node = {
      name: string;
      parent?: Node | null;
      children?: readonly Node[] | null;
    };
    const Folder: ReturnType<typeof ph.object> = ph.object("Folder", {
      fields: {
        name: ph.String({ required: true }),
        parent: ph.ref(() => Folder),
        children: ph.list(ph.ref(() => File, { required: true })),
      },
    });
    const File: ReturnType<typeof ph.object> = ph.object("File", {
      fields: {
        name: ph.String({ required: true }),
        folder: ph.ref(() => Folder),
      },
    });
    const value: Node = {
      name: "root",
      parent: null,
      children: [
        {
          name: "a",
          folder: { name: "sub", parent: null, children: null },
        } as never,
      ],
    };
    expect(Folder.validator.safeParse(value).success).toBe(true);
    expect(Folder.validator.safeParse({ name: 1 }).success).toBe(false);
    expect(resolveReference(Folder.fields.parent as never)).toBe(Folder);
  });

  it("rejects invalid targets eagerly for direct targets and on first resolution for thunks", () => {
    expect(rejection(() => ph.ref(ph.String() as never))).toMatchObject({
      code: "PH-DEF-REFERENCE-TARGET-INVALID",
      path: ["target"],
      received: "field use (scalar)",
    });
    expect(rejection(() => ph.ref(ph.ref(Status) as never)).received).toBe(
      "field use (ref)",
    );
    const anonymous = ph.input({ fields: { id: ph.OID() } });
    expect(rejection(() => ph.ref(anonymous)).message).toContain("anonymous");
    const lazyUndefined = ph.ref(() => undefined as never);
    expect(rejection(() => resolveReference(lazyUndefined))).toMatchObject({
      code: "PH-DEF-REFERENCE-TARGET-INVALID",
      received: "undefined",
    });
    const lazyField = ph.ref(() => ph.String() as never);
    expect(rejection(() => lazyField.validator.safeParse("x")).code).toBe(
      "PH-DEF-REFERENCE-TARGET-INVALID",
    );
  });
});

describe("ph.enum", () => {
  it("accepts string shorthand and metadata entries in authored order", () => {
    const Status = ph.enum("InvoiceStatus", {
      description: "Lifecycle.",
      values: [
        "DRAFT",
        { name: "ISSUED", description: "Sent." },
        { name: "VOID", deprecated: "Use CANCELLED." },
      ],
    });
    expect(Status).toMatchObject({
      kind: "enum",
      role: "named type; wrap it with ph.ref(Type) to use it as a field",
      name: "InvoiceStatus",
      description: "Lifecycle.",
      identity: {
        kind: "enum",
        name: "InvoiceStatus",
        description: "Lifecycle.",
      },
    });
    expect(Status.values).toStrictEqual([
      { name: "DRAFT", description: null, deprecated: null },
      { name: "ISSUED", description: "Sent.", deprecated: null },
      { name: "VOID", description: null, deprecated: "Use CANCELLED." },
    ]);
    expectTypeOf<OutputOf<typeof Status>>().toEqualTypeOf<
      "DRAFT" | "ISSUED" | "VOID"
    >();
    expect(deepFrozen(Status)).toBe(true);
  });

  it("rejects empty, duplicate, reserved, and invalid values", () => {
    expect(
      rejection(() => ph.enum("E", { values: [] as never })),
    ).toMatchObject({
      code: "PH-DEF-ENUM-VALUES-INVALID",
      path: ["options", "values"],
    });
    expect(rejection(() => ph.enum("E", { values: ["A", "A"] }))).toMatchObject(
      {
        code: "PH-DEF-ENUM-VALUES-INVALID",
        path: ["options", "values", 1, "name"],
      },
    );
    for (const reserved of ["true", "false", "null"]) {
      expect(
        rejection(() => ph.enum("E", { values: [reserved] })).received,
      ).toBe(reserved);
    }
    expect(rejection(() => ph.enum("E", { values: ["with-dash"] })).code).toBe(
      "PH-DEF-NAME-INVALID",
    );
    expect(
      rejection(() => ph.enum("bad name", { values: ["A"] })),
    ).toMatchObject({
      code: "PH-DEF-NAME-INVALID",
      path: ["name"],
    });
  });
});

describe("ph.object, ph.interface, ph.input", () => {
  it("keeps declaration order and freezes the descriptor", () => {
    const Item = ph.object("Item", {
      description: "One line.",
      fields: {
        zeta: ph.String(),
        alpha: ph.Int({ required: true }),
        mid: ph.list(ph.OID({ required: true }), { required: true }),
      },
    });
    expect(Object.keys(Item.fields)).toStrictEqual(["zeta", "alpha", "mid"]);
    expect(Item.implements).toStrictEqual([]);
    expect(Item.identity).toStrictEqual({
      kind: "object",
      name: "Item",
      description: "One line.",
    });
    expect(deepFrozen(Item)).toBe(true);
    expectTypeOf<InputObjectOf<typeof Item.fields>>().toEqualTypeOf<
      { alpha: number; mid: readonly string[] } & {
        zeta?: string | null | undefined;
      }
    >();
  });

  it("allows model-state field names such as description and required", () => {
    const State = ph.object("State", {
      fields: {
        description: ph.String(),
        required: ph.Boolean(),
        deprecated: ph.Int(),
      },
    });
    expect(Object.keys(State.fields)).toStrictEqual([
      "description",
      "required",
      "deprecated",
    ]);
  });

  it("rejects a named type, a factory, and junk in a field position with the right code", () => {
    const Status = ph.enum("Status", { values: ["A"] });
    expect(
      rejection(() => ph.object("X", { fields: { status: Status as never } })),
    ).toMatchObject({
      code: "PH-DEF-TYPE-AS-FIELD",
      path: ["options", "fields", "status"],
      repair: "Wrap the type with ph.ref(Status).",
    });
    expect(
      rejection(() => ph.object("X", { fields: { id: ph.OID as never } })),
    ).toMatchObject({
      code: "PH-SCALAR-FACTORY-AS-FIELD",
      path: ["options", "fields", "id"],
      repair: "ph.OID({ required: true })",
    });
    expect(
      rejection(() => ph.object("X", { fields: { id: "OID" as never } })).code,
    ).toBe("PH-DEF-FIELD-INVALID");
    expect(
      rejection(() => ph.object("X", { fields: { "bad key": ph.OID() } })).code,
    ).toBe("PH-DEF-NAME-INVALID");
    expect(
      rejection(() => ph.object("X", { fields: { __typename: ph.OID() } }))
        .code,
    ).toBe("PH-DEF-NAME-INVALID");
    expect(
      rejection(() => ph.object("X", { fields: {}, extra: 1 } as never)),
    ).toMatchObject({
      code: "PH-DEF-OPTION-INVALID",
      path: ["options", "extra"],
    });
  });

  it("implements interfaces and rejects non-interfaces or repeats", () => {
    const Named = ph.interface("Named", {
      fields: { name: ph.String({ required: true }) },
    });
    const Item = ph.object("Item", {
      fields: { name: ph.String({ required: true }) },
      implements: [Named],
    });
    expect(Item.implements).toStrictEqual([Named]);
    expect(Named).toMatchObject({ kind: "interface", name: "Named" });
    const Status = ph.enum("Status", { values: ["A"] });
    expect(
      rejection(() =>
        ph.object("X", { fields: {}, implements: [Status] as never }),
      ),
    ).toMatchObject({
      code: "PH-DEF-IMPLEMENTS-INVALID",
      path: ["options", "implements", 0],
    });
    expect(
      rejection(() =>
        ph.object("X", { fields: {}, implements: [Named, Named] }),
      ).path,
    ).toStrictEqual(["options", "implements", 1]);
  });

  it("rejects two distinct interfaces that claim one GraphQL name", () => {
    const first = ph.interface("Named", {
      fields: { name: ph.String({ required: true }) },
    });
    const second = ph.interface("Named", {
      fields: { label: ph.String({ required: true }) },
    });
    expect(second).not.toBe(first);
    expect(
      rejection(() =>
        ph.object("X", { fields: {}, implements: [first, second] }),
      ),
    ).toMatchObject({
      code: "PH-DEF-IMPLEMENTS-INVALID",
      path: ["options", "implements", 1],
      received: "Named",
    });
  });

  it("names an anonymous input per operation without mutating the token", () => {
    const anonymous = ph.input({ fields: { id: ph.OID({ required: true }) } });
    expect(anonymous.name).toBeNull();
    expect(anonymous.identity).toStrictEqual({
      kind: "input",
      name: null,
      description: null,
    });
    const add = nameAnonymousInput(anonymous, "AddItemInput");
    const remove = nameAnonymousInput(anonymous, "RemoveItemInput");
    expect(add.name).toBe("AddItemInput");
    expect(remove.name).toBe("RemoveItemInput");
    expect(anonymous.name).toBeNull();
    expect(add.fields).toBe(anonymous.fields);
    expect(add.validator).toBe(anonymous.validator);
    const named = ph.input("PagingInput", { fields: { cursor: ph.String() } });
    expect(nameAnonymousInput(named, "Other")).toBe(named);
    expect(
      rejection(() => nameAnonymousInput(anonymous, "bad name")).code,
    ).toBe("PH-DEF-NAME-INVALID");
  });
});

describe("ph.union", () => {
  const A = ph.object("A", { fields: { a: ph.Int({ required: true }) } });
  const B = ph.object("B", { fields: { b: ph.String({ required: true }) } });

  it("holds unique object members in order", () => {
    const AB = ph.union("AB", { members: [A, B], description: "Either." });
    expect(AB.members).toStrictEqual([A, B]);
    expect(AB.identity).toStrictEqual({
      kind: "union",
      name: "AB",
      description: "Either.",
    });
    expect(AB.validator.safeParse({ a: 1 }).success).toBe(true);
    expect(AB.validator.safeParse({ b: "x" }).success).toBe(true);
    expect(AB.validator.safeParse({ c: true }).success).toBe(false);
    expectTypeOf<OutputOf<typeof AB>>().toEqualTypeOf<
      { a: number } | { b: string }
    >();
  });

  it("rejects two distinct objects that claim one GraphQL name", () => {
    const otherA = ph.object("A", {
      fields: { z: ph.Int({ required: true }) },
    });
    expect(otherA).not.toBe(A);
    expect(
      rejection(() => ph.union("U", { members: [A, otherA] })),
    ).toMatchObject({
      code: "PH-DEF-UNION-MEMBERS-INVALID",
      path: ["options", "members", 1],
      received: "A",
    });
  });

  it("rejects empty, duplicate, non-object, and field-use members", () => {
    expect(rejection(() => ph.union("U", { members: [] as never })).code).toBe(
      "PH-DEF-UNION-MEMBERS-INVALID",
    );
    expect(
      rejection(() => ph.union("U", { members: [A, A] })).path,
    ).toStrictEqual(["options", "members", 1]);
    const Status = ph.enum("Status", { values: ["A"] });
    expect(
      rejection(() => ph.union("U", { members: [Status] as never })),
    ).toMatchObject({
      code: "PH-DEF-UNION-MEMBERS-INVALID",
      received: "enum",
    });
    expect(
      rejection(() => ph.union("U", { members: [ph.String()] as never })),
    ).toMatchObject({
      code: "PH-DEF-UNION-MEMBERS-INVALID",
      received: "field use (scalar)",
    });
    const anonymousInput = ph.input({ fields: {} });
    expect(
      rejection(() => ph.union("U", { members: [anonymousInput] as never }))
        .received,
    ).toBe("input");
  });
});
