import {
  AddFileInputSchema,
  TransmitterTypeSchema,
} from "@powerhousedao/shared/document-drive";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ph } from "../../../src/definition/dsl/field.js";
import { defineScalar } from "../../../src/scalars/define-scalar.js";
import type { AnyDescriptor } from "../../../src/definition/dsl/types.js";
import { resolveReference } from "../../../src/definition/dsl/zod.js";

const FORBIDDEN_DEF_TYPES = new Set([
  "default",
  "prefault",
  "catch",
  "pipe",
  "transform",
]);

type ZodDef = {
  readonly type: string;
  readonly coerce?: boolean;
  readonly shape?: Record<string, z.ZodType>;
  readonly element?: z.ZodType;
  readonly innerType?: z.ZodType;
  readonly options?: readonly z.ZodType[];
  readonly keyType?: z.ZodType;
  readonly valueType?: z.ZodType;
  readonly getter?: () => z.ZodType;
};

function defOf(schema: z.ZodType): ZodDef {
  return (schema as unknown as { _zod: { def: ZodDef } })._zod.def;
}

function walkDefs(schema: z.ZodType, seen = new Set<z.ZodType>()): string[] {
  if (seen.has(schema)) return [];
  seen.add(schema);
  const def = defOf(schema);
  const found = [def.type, ...(def.coerce === true ? ["coerce"] : [])];
  const children = [
    ...Object.values(def.shape ?? {}),
    ...(def.element ? [def.element] : []),
    ...(def.innerType ? [def.innerType] : []),
    ...(def.options ?? []),
    ...(def.keyType ? [def.keyType] : []),
    ...(def.valueType ? [def.valueType] : []),
    ...(def.getter ? [def.getter()] : []),
  ];
  return [...found, ...children.flatMap((child) => walkDefs(child, seen))];
}

function agreesWith(
  ours: z.ZodType,
  generated: z.ZodType,
  values: readonly unknown[],
): void {
  for (const value of values) {
    const mine = ours.safeParse(value);
    const theirs = generated.safeParse(value);
    expect(mine.success, JSON.stringify(value)).toBe(theirs.success);
    if (!mine.success && !theirs.success) {
      expect(mine.error.issues.map((issue) => issue.message)).toStrictEqual(
        theirs.error.issues.map((issue) => issue.message),
      );
    }
  }
}

const probeValues = [undefined, null, "", "text", 0, 1.5, true, {}, [], ["x"]];

describe("validators are predicates over the raw input", () => {
  it("accepts unknown keys and leaves the caller's object as the source of truth", () => {
    const Item = ph.object("Item", {
      fields: { id: ph.OID({ required: true }), note: ph.String() },
    });
    const input = { id: "a", note: null, memo: "kept", nested: { deep: true } };
    const result = Item.validator.safeParse(input);
    expect(result.success).toBe(true);
    expect(Object.keys(input)).toStrictEqual(["id", "note", "memo", "nested"]);
    expect(input.memo).toBe("kept");
    expect(result.success && result.data).not.toBe(input);
  });

  it("contains no defaults, catches, transforms, pipes, preprocessing, or coercion", () => {
    const StringRecord = defineScalar({
      name: "StringRecord",
      description: "A JSON object of strings.",
      schema: z.record(z.string(), z.string()),
    });
    const Status = ph.enum("Status", { values: ["A", "B"] });
    const Leaf = ph.object("Leaf", { fields: { n: ph.Int() } });
    const Big = ph.object("Big", {
      fields: {
        id: ph.OID({ required: true }),
        money: ph.Money(),
        amount: ph.Amount({ required: true }),
        address: ph.Address(),
        json: ph.scalar(StringRecord),
        unknown: ph.Unknown(),
        status: ph.ref(Status),
        tags: ph.list(ph.list(ph.String({ required: true }))),
        leaf: ph.ref(() => Leaf, { required: true }),
        when: ph.DateTime(),
      },
    });
    const Input = ph.input("BigInput", { fields: Big.fields });
    const Either = ph.union("Either", { members: [Big, Leaf] });
    for (const descriptor of [Big, Input, Either, Status] as AnyDescriptor[]) {
      const defs = walkDefs(descriptor.validator);
      expect(
        defs.filter((type) => FORBIDDEN_DEF_TYPES.has(type)),
      ).toStrictEqual([]);
      expect(defs).not.toContain("coerce");
      expect(defs.length).toBeGreaterThan(0);
    }
    expect(walkDefs(Big.validator).length).toBeGreaterThan(12);
  });
});

describe("nullability by slot", () => {
  it("lets a nullable field be absent in state and in inputs, as generated schemas do", () => {
    const state = ph.object("S", {
      fields: { note: ph.String(), n: ph.Int({ required: true }) },
    });
    const input = ph.input("I", {
      fields: { note: ph.String(), n: ph.Int({ required: true }) },
    });
    for (const validator of [state.validator, input.validator]) {
      expect(
        [{ n: 1, note: null }, { n: 1, note: undefined }, { n: 1 }, {}].map(
          (value) => validator.safeParse(value).success,
        ),
      ).toStrictEqual([true, true, true, false]);
    }
  });

  it("refuses an undefined nullable list item in state and in inputs", () => {
    const LeafInput = ph.input("LeafInput", { fields: { v: ph.String() } });
    const Leaf = ph.object("Leaf", { fields: { v: ph.String() } });
    for (const list of [
      ph.list(ph.String()),
      ph.list(ph.ref(LeafInput)),
      ph.list(ph.ref(Leaf)),
    ]) {
      expect(
        [[null], [undefined], undefined, null].map(
          (value) => list.validator.safeParse(value).success,
        ),
      ).toStrictEqual([true, false, true, true]);
    }
    const inputs = ph.list(ph.ref(LeafInput));
    expect(
      [[{ v: undefined }], [{}], [{ v: 1 }]].map(
        (value) => inputs.validator.safeParse(value).success,
      ),
    ).toStrictEqual([true, true, false]);
  });

  it("fills a scalar default but never a list default, as generated schemas do", () => {
    const Input = ph.input("DefaultsInput", {
      fields: {
        count: ph.Int({ required: true, defaultValue: 3 }),
        tags: ph.list(ph.String(), { required: true, defaultValue: "a" }),
      },
    });
    const generated = z.object({
      count: z.number().default(3),
      tags: z.array(z.string().nullable()),
    });
    agreesWith(Input.validator, generated, [{}, { tags: [] }, { count: 1 }]);
    expect(Input.validator.parse({ tags: [] })).toStrictEqual({
      count: 3,
      tags: [],
    });
  });

  it("validates nested lists like the generated schemas", () => {
    const cases = [
      [
        ph.list(ph.list(ph.String())),
        z.array(z.array(z.string().nullable()).nullish()).nullish(),
      ],
      [
        ph.list(ph.list(ph.String(), { required: true })),
        z.array(z.array(z.string().nullable())).nullish(),
      ],
      [
        ph.list(ph.list(ph.list(ph.Int()))),
        z
          .array(z.array(z.array(z.number().nullable()).nullish()).nullish())
          .nullish(),
      ],
      [
        ph.list(ph.list(ph.String({ required: true }))),
        z.array(z.array(z.string()).nullish()).nullish(),
      ],
      [
        ph.list(ph.list(ph.String()), { required: true }),
        z.array(z.array(z.string().nullable()).nullish()),
      ],
    ] as const;
    for (const [list, generated] of cases) {
      agreesWith(list.validator, generated, [
        [[null]],
        [[undefined]],
        [null],
        [undefined],
        [],
        [["a"]],
        [[1]],
        [[[null]]],
        [[[undefined]]],
        [[[]], [undefined], null],
        null,
        undefined,
      ]);
    }
  });

  it("accepts an optional __typename literal on state objects only", () => {
    const S = ph.object("S", { fields: { n: ph.Int({ required: true }) } });
    expect(S.validator.safeParse({ __typename: "S", n: 1 }).success).toBe(true);
    expect(S.validator.safeParse({ __typename: "Other", n: 1 }).success).toBe(
      false,
    );
    expect(S.validator.safeParse({ n: 1 }).success).toBe(true);
    const I = ph.input("I", { fields: { n: ph.Int({ required: true }) } });
    expect(I.validator.safeParse({ __typename: "Other", n: 1 }).success).toBe(
      true,
    );
  });
});

describe("field-use nullability", () => {
  const verdicts = (validator: z.ZodType, values: readonly unknown[]) =>
    values.map((value) => validator.safeParse(value).success);

  it("lets a nullable field be null or absent", () => {
    expect(
      verdicts(ph.String().validator, [undefined, null, "", "text", 0]),
    ).toStrictEqual([true, true, true, true, false]);
  });

  it("refuses null and absence on a required field", () => {
    expect(
      verdicts(ph.String({ required: true }).validator, [
        undefined,
        null,
        "",
        0,
      ]),
    ).toStrictEqual([false, false, true, false]);
    expect(
      verdicts(ph.Boolean({ required: true }).validator, [
        undefined,
        null,
        true,
        "true",
      ]),
    ).toStrictEqual([false, false, true, false]);
  });

  it("lets a nullable list item be null but not absent", () => {
    expect(
      verdicts(ph.list(ph.String()).validator, [
        undefined,
        null,
        [],
        ["a", null],
        ["a", undefined],
        [1],
      ]),
    ).toStrictEqual([true, true, true, true, false, false]);
  });

  it("refuses a null item in a required list of required strings", () => {
    expect(
      verdicts(
        ph.list(ph.String({ required: true }), { required: true }).validator,
        [undefined, [], ["a", "b"], ["a", null], [1]],
      ),
    ).toStrictEqual([false, true, true, false, false]);
  });

  it("matches the checked-in document-drive input schema", () => {
    const input = AddFileInputSchema().shape;
    agreesWith(ph.String().validator, input.parentFolder, probeValues);
    agreesWith(
      ph.String({ required: true }).validator,
      input.documentType,
      probeValues,
    );
  });
});

describe("references", () => {
  it("builds a cyclic graph and validates finite values", () => {
    const Folder: ReturnType<typeof ph.object> = ph.object("Folder", {
      fields: {
        name: ph.String({ required: true }),
        children: ph.list(ph.ref(() => Folder, { required: true })),
      },
    });
    const value = {
      name: "root",
      children: [
        { name: "a", children: null },
        { name: "b", children: [] },
      ],
    };
    expect(Folder.validator.safeParse(value).success).toBe(true);
    expect(
      Folder.validator.safeParse({ name: "x", children: [{ name: 1 }] })
        .success,
    ).toBe(false);
  });

  it("gives a diamond one memoized schema instance", () => {
    const Leaf = ph.object("Leaf", { fields: { v: ph.Int() } });
    const A = ph.object("A", { fields: { leaf: ph.ref(Leaf) } });
    const B = ph.object("B", { fields: { leaf: ph.ref(() => Leaf) } });
    const Root = ph.object("Root", { fields: { a: ph.ref(A), b: ph.ref(B) } });
    expect(resolveReference(A.fields.leaf as never)).toBe(Leaf);
    expect(resolveReference(B.fields.leaf as never)).toBe(Leaf);
    expect(resolveReference(A.fields.leaf as never).validator).toBe(
      Leaf.validator,
    );
    expect(
      Root.validator.safeParse({
        a: { leaf: { v: 1 } },
        b: { leaf: { v: null } },
      }).success,
    ).toBe(true);
  });
});

describe("identity independence from Zod metadata", () => {
  it("does not change any identity when metadata is stripped from every schema", () => {
    const Status = ph.enum("Status", { values: ["A"] });
    const Item = ph.object("Item", {
      fields: { status: ph.ref(Status), tags: ph.list(ph.String()) },
    });
    const before = JSON.stringify([
      Item.identity,
      Item.fields.status.identity,
      Status.identity,
    ]);
    const schemas = [
      Item.validator,
      Status.validator,
      Item.fields.status.validator,
      Item.fields.tags.validator,
    ];
    for (const schema of schemas) {
      z.globalRegistry.add(schema, { title: "scratch" });
      expect(schema.meta()).toStrictEqual({ title: "scratch" });
    }
    const identities = JSON.stringify([
      Item.identity,
      Item.fields.status.identity,
      Status.identity,
    ]);
    for (const schema of schemas) {
      z.globalRegistry.remove(schema);
      expect(schema.meta()).toBeUndefined();
    }
    expect(identities).toBe(before);
    expect(resolveReference(Item.fields.status as never)).toBe(Status);
  });
});

describe("historical validator behavior", () => {
  it("lets required Unknown and Upload accept absence, as z.unknown and z.any do", () => {
    expect(
      ph.Unknown({ required: true }).validator.safeParse(undefined).success,
    ).toBe(true);
    expect(
      ph.Upload({ required: true }).validator.safeParse(undefined).success,
    ).toBe(true);
    expect(
      ph.Unknown({ required: true }).validator.safeParse(10n).success,
    ).toBe(true);
  });

  it("matches generated error text for a required scalar given the wrong type", () => {
    const ours = ph.String({ required: true }).validator.safeParse(1);
    const generated = z.string().safeParse(1);
    expect(ours.success).toBe(false);
    expect(generated.success).toBe(false);
    if (!ours.success && !generated.success) {
      expect(ours.error.issues[0].message).toBe(
        generated.error.issues[0].message,
      );
    }
  });

  it("validates unions and interfaces like their generated equivalents", () => {
    const Named = ph.interface("Named", {
      fields: { name: ph.String({ required: true }) },
    });
    const File = ph.object("File", {
      fields: { name: ph.String({ required: true }), size: ph.Int() },
      implements: [Named],
    });
    const Folder = ph.object("Folder", {
      fields: {
        name: ph.String({ required: true }),
        count: ph.Int({ required: true }),
      },
    });
    const Node = ph.union("Node", { members: [File, Folder] });
    const generatedNode = z.union([
      z.object({
        __typename: z.literal("File").optional(),
        name: z.string(),
        size: z.number().nullish(),
      }),
      z.object({
        __typename: z.literal("Folder").optional(),
        name: z.string(),
        count: z.number(),
      }),
    ]);
    agreesWith(Node.validator, generatedNode, [
      { name: "a", size: null },
      { name: "a", count: 2 },
      { name: "a" },
      { __typename: "File", name: "a", size: 1 },
      { __typename: "Folder", name: "a", size: 1 },
      null,
    ]);
    expect(Named.validator.safeParse({ name: "x", extra: 1 }).success).toBe(
      true,
    );
    expect(Named.validator.safeParse({}).success).toBe(false);
  });
});

describe("member order that the platform persists", () => {
  it("lists enum options in the generated order", () => {
    const TransmitterType = ph.enum("TransmitterType", {
      values: [
        "Internal",
        "SwitchboardPush",
        "PullResponder",
        "SecureConnect",
        "MatrixConnect",
        "RESTWebhook",
      ],
    });
    const generated = TransmitterTypeSchema;
    const ours = TransmitterType.validator.safeParse("nope");
    const theirs = generated.safeParse("nope");
    expect(ours.success).toBe(false);
    expect(theirs.success).toBe(false);
    expect(ours.error?.issues[0]?.message).toBe(
      theirs.error?.issues[0]?.message,
    );
    expect(TransmitterType.values.map((value) => value.name)).toStrictEqual([
      "Internal",
      "SwitchboardPush",
      "PullResponder",
      "SecureConnect",
      "MatrixConnect",
      "RESTWebhook",
    ]);
  });

  it("lists union members in the generated order", () => {
    const FolderNode = ph.object("FolderNode", {
      fields: {
        id: ph.String({ required: true }),
        kind: ph.String({ required: true }),
        name: ph.String({ required: true }),
        parentFolder: ph.String(),
      },
    });
    const FileNode = ph.object("FileNode", {
      fields: {
        documentType: ph.String({ required: true }),
        id: ph.String({ required: true }),
        kind: ph.String({ required: true }),
        name: ph.String({ required: true }),
        parentFolder: ph.String(),
      },
    });
    const Node = ph.union("Node", { members: [FolderNode, FileNode] });
    const refusal = Node.validator.safeParse({ id: 4 }).error?.issues[0];
    expect(
      refusal?.code === "invalid_union" &&
        refusal.errors.map((branch) =>
          branch.map((issue) => issue.path.join(".")),
        ),
    ).toStrictEqual([
      ["documentType", "id", "kind", "name"],
      ["id", "kind", "name"],
    ]);
    expect(Node.members.map((member) => member.name)).toStrictEqual([
      "FolderNode",
      "FileNode",
    ]);
  });

  it("orders numbered members as the generator does, item2 before item10", () => {
    const Probe = ph.object("Probe", {
      fields: { item10: ph.Int(), item2: ph.Int(), a: ph.Int() },
    });
    const refusal = Probe.validator.safeParse({
      item10: "x",
      item2: "x",
      a: "x",
    });
    expect(refusal.error?.issues.map((issue) => issue.path[0])).toStrictEqual([
      "a",
      "item2",
      "item10",
    ]);
    const Kind = ph.enum("ProbeKind", { values: ["V10", "V2", "A"] });
    expect(Kind.validator.safeParse("nope").error?.issues[0]?.message).toBe(
      'Invalid option: expected one of "A"|"V2"|"V10"',
    );
  });

  it("validates an explicit empty input like its generated equivalent", () => {
    const empty = ph.input({ fields: {} });
    const generated = z.object({ _empty: z.boolean().nullish() });
    agreesWith(empty.validator, generated, [
      {},
      { _empty: true },
      { _empty: null },
      { _empty: undefined },
      { _empty: 5 },
      { _empty: "yes" },
      { other: 1 },
      null,
    ]);
  });
});
