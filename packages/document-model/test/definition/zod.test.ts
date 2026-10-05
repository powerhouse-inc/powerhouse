import {
  AddFileInputSchema,
  DocumentDriveLocalStateSchema,
  DocumentDriveStateSchema,
  NodeSchema,
  TransmitterTypeSchema,
} from "@powerhousedao/shared/document-drive";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ph } from "../../src/definition/field.js";
import type { AnyDescriptor } from "../../src/definition/types.js";
import {
  buildValidator,
  resolveReference,
  validatorFor,
} from "../../src/definition/zod.js";

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
    const Status = ph.enum("Status", { values: ["A", "B"] });
    const Leaf = ph.object("Leaf", { fields: { n: ph.Int() } });
    const Big = ph.object("Big", {
      fields: {
        id: ph.OID({ required: true }),
        money: ph.Money(),
        amount: ph.Amount({ required: true }),
        address: ph.Address(),
        json: ph.JSONObject(),
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
    expect(walkDefs(validatorFor(Big.fields.tags, "input"))).not.toContain(
      "default",
    );
  });
});

describe("position-dependent nullability", () => {
  it("uses nullable in state and nullish in inputs, as generated schemas do", () => {
    const state = ph.object("S", {
      fields: { note: ph.String(), n: ph.Int({ required: true }) },
    });
    const input = ph.input("I", {
      fields: { note: ph.String(), n: ph.Int({ required: true }) },
    });
    expect(state.validator.safeParse({ n: 1, note: null }).success).toBe(true);
    expect(state.validator.safeParse({ n: 1, note: undefined }).success).toBe(
      false,
    );
    expect(state.validator.safeParse({ n: 1 }).success).toBe(false);
    expect(input.validator.safeParse({ n: 1, note: null }).success).toBe(true);
    expect(input.validator.safeParse({ n: 1, note: undefined }).success).toBe(
      true,
    );
    expect(input.validator.safeParse({ n: 1 }).success).toBe(true);
    expect(input.validator.safeParse({ note: "x" }).success).toBe(false);
  });

  it("carries the position through lists and references", () => {
    const LeafInput = ph.input("LeafInput", { fields: { v: ph.String() } });
    const list = ph.list(ph.ref(LeafInput));
    expect(validatorFor(list, "output").safeParse([undefined]).success).toBe(
      false,
    );
    expect(validatorFor(list, "input").safeParse([undefined]).success).toBe(
      true,
    );
    expect(
      validatorFor(list, "input").safeParse([{ v: undefined }]).success,
    ).toBe(true);
    expect(validatorFor(list, "input").safeParse([{ v: 1 }]).success).toBe(
      false,
    );
    expect(validatorFor(list, "output")).toBe(list.validator);
    expect(validatorFor(list, "input")).toBe(validatorFor(list, "input"));
    expect(validatorFor(LeafInput, "input")).toBe(LeafInput.validator);
    const Leaf = ph.object("Leaf", { fields: { v: ph.String() } });
    const outputList = ph.list(ph.ref(Leaf));
    expect(
      validatorFor(outputList, "output").safeParse([{ v: undefined }]).success,
    ).toBe(false);
    expect(
      validatorFor(outputList, "output").safeParse([{ v: null }]).success,
    ).toBe(true);
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

describe("parity with the generated document-drive schemas", () => {
  const state = DocumentDriveStateSchema().shape;
  const local = DocumentDriveLocalStateSchema().shape;
  const input = AddFileInputSchema().shape;

  it("matches a nullable state field", () => {
    agreesWith(validatorFor(ph.String(), "output"), state.icon, probeValues);
  });

  it("matches a required state field", () => {
    agreesWith(
      validatorFor(ph.String({ required: true }), "output"),
      state.name,
      probeValues,
    );
    agreesWith(
      validatorFor(ph.Boolean({ required: true }), "output"),
      local.availableOffline,
      probeValues,
    );
  });

  it("matches a nullable input field, including undefined", () => {
    agreesWith(
      validatorFor(ph.String(), "input"),
      input.parentFolder,
      probeValues,
    );
    agreesWith(
      validatorFor(ph.String({ required: true }), "input"),
      input.documentType,
      probeValues,
    );
  });

  it("matches a required list of required strings", () => {
    const generated = z.array(z.string());
    agreesWith(
      validatorFor(
        ph.list(ph.String({ required: true }), { required: true }),
        "output",
      ),
      generated,
      [...probeValues, ["a", "b"], ["a", null], [1]],
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
    const leafInput = validatorFor(Leaf, "input");
    expect(validatorFor(Leaf, "input")).toBe(leafInput);
    expect(
      Root.validator.safeParse({
        a: { leaf: { v: 1 } },
        b: { leaf: { v: null } },
      }).success,
    ).toBe(true);
    expect(buildValidator(A.fields.leaf, "input")).not.toBe(
      validatorFor(A.fields.leaf, "input"),
    );
    expect(validatorFor(A.fields.leaf, "input")).toBe(
      validatorFor(A.fields.leaf, "input"),
    );
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
      schema.meta({ title: "scratch" });
      z.globalRegistry.remove(schema);
      expect(schema.meta()).toBeUndefined();
    }
    expect(
      JSON.stringify([
        Item.identity,
        Item.fields.status.identity,
        Status.identity,
      ]),
    ).toBe(before);
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
        size: z.number().nullable(),
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
    // The drive SDL declares these six in a different order than the
    // generated `TransmitterTypeSchema`, which is alphabetical.
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
    // A failed operation persists this message verbatim.
    expect(ours.error?.issues[0]?.message).toBe(
      theirs.error?.issues[0]?.message,
    );
    // The authored order is still what the structured definition records.
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
    // The drive's node types, field for field, so the comparison is against
    // the real generated `NodeSchema`.
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
    // The SDL is `union Node = FolderNode | FileNode`; the generated schema is
    // `z.union([FileNodeSchema(), FolderNodeSchema()])`.
    const Node = ph.union("Node", { members: [FolderNode, FileNode] });
    const ours = Node.validator.safeParse({ id: 4 });
    const theirs = NodeSchema().safeParse({ id: 4 });
    expect(ours.success).toBe(false);
    expect(JSON.stringify(ours.error?.issues)).toBe(
      JSON.stringify(theirs.error?.issues),
    );
    // The authored order is still what the structured definition records.
    expect(Node.members.map((member) => member.name)).toStrictEqual([
      "FolderNode",
      "FileNode",
    ]);
  });

  it("validates an explicit empty input like its generated equivalent", () => {
    const empty = ph.input({ fields: {} });
    // `input X { _empty: Boolean }` generates exactly this.
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
