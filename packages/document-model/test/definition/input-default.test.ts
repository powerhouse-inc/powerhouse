import { buildSchema, GraphQLError, GraphQLInputObjectType } from "graphql";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { DefinitionDiagnosticCollector } from "../../src/definition/diagnostics.js";
import { ph } from "../../src/definition/field.js";
import { printSchemaSegment } from "../../src/definition/printer.js";
import { defineScalar } from "../../src/definition/scalars/define-scalar.js";
import { DescriptorWalk } from "../../src/definition/structured.js";
import type {
  AnyFieldDescriptor,
  AnyTypeDescriptor,
} from "../../src/definition/types.js";

const BUILT_IN_SCALARS = new Set(["Int", "Float", "String", "Boolean", "ID"]);

function compileAndBuild(root: AnyTypeDescriptor) {
  const collector = new DefinitionDiagnosticCollector();
  const walk = new DescriptorWalk(collector, {
    allowOutputDefaults: false,
    allowEquals: true,
    validateInputDefaults: true,
    computedFieldsAreMembers: false,
    internalScalarsAreReferenceable: false,
  });
  const definition = walk.visitType(root, "input", ["root"]);
  const scalars = [...walk.scalars]
    .filter((name) => !BUILT_IN_SCALARS.has(name))
    .map((name) => `scalar ${name}\n`)
    .join("");
  const sdl = `${scalars}${printSchemaSegment(walk.definitions)}type Query { probe(input: ${definition?.name}): Int }\n`;
  let host: string;
  try {
    const probe = buildSchema(sdl).getType(definition?.name ?? "");
    const dropped =
      probe instanceof GraphQLInputObjectType &&
      Object.values(probe.getFields()).some(
        (field) =>
          field.astNode?.defaultValue !== undefined &&
          field.defaultValue === undefined,
      );
    host = dropped ? "drops the default" : "builds";
  } catch (error) {
    if (error instanceof RangeError) host = "overflows the stack";
    else if (error instanceof GraphQLError) host = "rejects the SDL";
    else throw error;
  }
  return {
    refused: collector.diagnostics.map(({ code, path, message, repair }) => ({
      code,
      path: path.join("."),
      message,
      repair,
    })),
    host,
  };
}

function probe(value: AnyFieldDescriptor): AnyTypeDescriptor {
  return ph.input("Probe", { fields: { value } });
}

const TYPE_REPAIR =
  "Use a default the field's type accepts, or remove defaultValue.";
const CYCLE_REPAIR =
  "Remove any one object default in the cycle, or default a nullable field in it to null. Either change clears every diagnostic this cycle reports.";

describe("input defaults that would break the host schema build", () => {
  it.each([
    {
      case: "a self-referencing input that defaults to an object",
      root: (): AnyTypeDescriptor => {
        const Node: AnyTypeDescriptor = ph.input("Node", {
          fields: {
            child: ph.ref((): AnyTypeDescriptor => Node, {
              defaultValue: {} as never,
            }),
          },
        });
        return Node;
      },
      refused: [
        {
          code: "PH-DEF-OPTION-INVALID",
          path: "root.fields.child.defaultValue",
          message:
            "defaultValue builds input Node from itself through the object defaults on Node.child, which GraphQL cannot resolve.",
          repair: CYCLE_REPAIR,
        },
      ],
      host: "overflows the stack",
    },
    {
      case: "a self-referencing input that defaults to null",
      root: (): AnyTypeDescriptor => {
        const Node: AnyTypeDescriptor = ph.input("Node", {
          fields: {
            child: ph.ref((): AnyTypeDescriptor => Node, {
              defaultValue: null as never,
            }),
          },
        });
        return Node;
      },
      refused: [],
      host: "builds",
    },
    {
      case: "a self-referencing input whose object default sets a field to null",
      root: (): AnyTypeDescriptor => {
        const Node: AnyTypeDescriptor = ph.input("Node", {
          fields: {
            child: ph.ref((): AnyTypeDescriptor => Node, {
              defaultValue: { child: null } as never,
            }),
          },
        });
        return Node;
      },
      refused: [
        {
          code: "PH-DEF-OPTION-INVALID",
          path: "root.fields.child.defaultValue",
          message:
            "defaultValue builds input Node from itself through the object defaults on Node.child, which GraphQL cannot resolve.",
          repair: CYCLE_REPAIR,
        },
      ],
      host: "overflows the stack",
    },
    {
      case: "a self-referencing list that defaults to one object",
      root: (): AnyTypeDescriptor => {
        const Node: AnyTypeDescriptor = ph.input("Node", {
          fields: {
            children: ph.list(
              ph.ref((): AnyTypeDescriptor => Node),
              { defaultValue: [{}] as never },
            ),
          },
        });
        return Node;
      },
      refused: [
        {
          code: "PH-DEF-OPTION-INVALID",
          path: "root.fields.children.defaultValue",
          message:
            "defaultValue builds input Node from itself through the object defaults on Node.children, which GraphQL cannot resolve.",
          repair: CYCLE_REPAIR,
        },
      ],
      host: "overflows the stack",
    },
    {
      case: "a self-referencing list that defaults to an empty list",
      root: (): AnyTypeDescriptor => {
        const Node: AnyTypeDescriptor = ph.input("Node", {
          fields: {
            children: ph.list(
              ph.ref((): AnyTypeDescriptor => Node),
              { defaultValue: [] as never },
            ),
          },
        });
        return Node;
      },
      refused: [],
      host: "builds",
    },
    {
      case: "two inputs whose object defaults hold each other",
      root: (): AnyTypeDescriptor => {
        const A: AnyTypeDescriptor = ph.input("A", {
          fields: {
            b: ph.ref((): AnyTypeDescriptor => B, {
              defaultValue: {} as never,
            }),
          },
        });
        const B: AnyTypeDescriptor = ph.input("B", {
          fields: {
            a: ph.ref((): AnyTypeDescriptor => A, {
              defaultValue: {} as never,
            }),
          },
        });
        return A;
      },
      refused: [
        {
          code: "PH-DEF-OPTION-INVALID",
          path: "root.fields.b.defaultValue",
          message:
            "defaultValue builds input A from itself through the object defaults on A.b, B.a, which GraphQL cannot resolve.",
          repair: CYCLE_REPAIR,
        },
        {
          code: "PH-DEF-OPTION-INVALID",
          path: "root.fields.b.fields.a.defaultValue",
          message:
            "defaultValue builds input B from itself through the object defaults on B.a, A.b, which GraphQL cannot resolve.",
          repair: CYCLE_REPAIR,
        },
      ],
      host: "overflows the stack",
    },
    {
      case: "two mutually referencing inputs with one object default",
      root: (): AnyTypeDescriptor => {
        const A: AnyTypeDescriptor = ph.input("A", {
          fields: {
            b: ph.ref((): AnyTypeDescriptor => B, {
              defaultValue: {} as never,
            }),
          },
        });
        const B: AnyTypeDescriptor = ph.input("B", {
          fields: { a: ph.ref((): AnyTypeDescriptor => A) },
        });
        return A;
      },
      refused: [],
      host: "builds",
    },
    {
      case: "a cycle closed by an object nested inside a default",
      root: (): AnyTypeDescriptor => {
        const A: AnyTypeDescriptor = ph.input("A", {
          fields: {
            b: ph.ref((): AnyTypeDescriptor => B, {
              defaultValue: { c: {} } as never,
            }),
          },
        });
        const B: AnyTypeDescriptor = ph.input("B", {
          fields: { c: ph.ref((): AnyTypeDescriptor => C) },
        });
        const C: AnyTypeDescriptor = ph.input("C", {
          fields: {
            a: ph.ref((): AnyTypeDescriptor => A, {
              defaultValue: {} as never,
            }),
          },
        });
        return A;
      },
      refused: [
        {
          code: "PH-DEF-OPTION-INVALID",
          path: "root.fields.b.defaultValue",
          message:
            "defaultValue builds input A from itself through the object defaults on A.b, C.a, which GraphQL cannot resolve.",
          repair: CYCLE_REPAIR,
        },
        {
          code: "PH-DEF-OPTION-INVALID",
          path: "root.fields.b.fields.c.fields.a.defaultValue",
          message:
            "defaultValue builds input C from itself through the object defaults on C.a, A.b, which GraphQL cannot resolve.",
          repair: CYCLE_REPAIR,
        },
      ],
      host: "overflows the stack",
    },
    {
      case: "an object default on an input that cannot reach back",
      root: (): AnyTypeDescriptor => {
        const Leaf = ph.input("Leaf", { fields: { x: ph.Int() } });
        return ph.input("Branch", {
          fields: { leaf: ph.ref(Leaf, { defaultValue: {} }) },
        });
      },
      refused: [],
      host: "builds",
    },
    ...[
      ["a key with a dash", { "a-b": 1 }, "a-b"],
      ["an empty key", { "": 1 }, ""],
      ["a key that starts with a digit", { "1x": 1 }, "1x"],
      ["a nested key with a dash", { a: { "b-c": 1 } }, "b-c"],
      ["a key with a dash inside a list", [{ "b-c": 1 }], "b-c"],
      ["a key that is a lone surrogate", { "\uD800": 1 }, "\uD800"],
    ].map(([label, value, key]) => ({
      case: `an Unknown default with ${label as string}`,
      root: () => probe(ph.Unknown({ defaultValue: value as never })),
      refused: [
        {
          code: "PH-DEF-OPTION-INVALID",
          path: "root.fields.value.defaultValue",
          message: `defaultValue is not a valid value of type Unknown: key ${JSON.stringify(key)} is not a GraphQL name.`,
          repair: TYPE_REPAIR,
        },
      ],
      host: "rejects the SDL",
    })),
    {
      case: "an Unknown default whose keys are GraphQL names",
      root: () =>
        probe(ph.Unknown({ defaultValue: { a_b: 1, _c: { d2: [2] } } })),
      refused: [],
      host: "builds",
    },
    ...(
      [
        [
          "a String with a lone leading surrogate",
          ph.String({ defaultValue: "\uD800" }),
          "String",
          '"\\ud800"',
        ],
        [
          "a String with a lone trailing surrogate",
          ph.String({ defaultValue: "a\uDC00" }),
          "String",
          '"a\\udc00"',
        ],
        [
          "an Unknown with a lone surrogate in a list",
          ph.Unknown({ defaultValue: ["\uD800"] }),
          "Unknown",
          '"\\ud800"',
        ],
      ] as const
    ).map(([label, field, type, shown]) => ({
      case: label,
      root: () => probe(field),
      refused: [
        {
          code: "PH-DEF-OPTION-INVALID",
          path: "root.fields.value.defaultValue",
          message: `defaultValue is not a valid value of type ${type}: ${shown} is not well-formed Unicode.`,
          repair: TYPE_REPAIR,
        },
      ],
      host: "rejects the SDL",
    })),
    {
      case: "an explicitly empty input that defaults to _empty true",
      root: () =>
        probe(
          ph.ref(ph.input("Em", { fields: {} }), {
            defaultValue: { _empty: true },
          }),
        ),
      refused: [],
      host: "builds",
    },
    {
      case: "an explicitly empty input that defaults _empty to a string",
      root: () =>
        probe(
          ph.ref(ph.input("Em", { fields: {} }), {
            defaultValue: { _empty: "x" },
          }),
        ),
      refused: [
        {
          code: "PH-DEF-OPTION-INVALID",
          path: "root.fields.value.defaultValue",
          message:
            'defaultValue is not a valid value of type Em: field "_empty": "x" is not a boolean.',
          repair: TYPE_REPAIR,
        },
      ],
      host: "drops the default",
    },
    {
      case: "a String with a surrogate pair",
      root: () => probe(ph.String({ defaultValue: "😀" })),
      refused: [],
      host: "builds",
    },
  ])("$case", ({ root, refused, host }) => {
    expect(compileAndBuild(root())).toStrictEqual({ refused, host });
  });
});

describe("an input default a validator rejects", () => {
  it("joins every issue and ends the message with one period", () => {
    const Code = defineScalar({
      name: "Code",
      description: "A code of three or more digits.",
      representation: "string",
      validator: z.string().min(3, "Too short.").regex(/^\d+$/, "Digits only."),
      zodSource:
        'z.string().min(3, "Too short.").regex(/^\\d+$/, "Digits only.")',
    });
    expect(
      compileAndBuild(probe(Code({ defaultValue: "a" }))).refused.map(
        ({ message }) => message,
      ),
    ).toStrictEqual([
      'defaultValue is not a valid value of type Code: "a" is not a valid Code: Too short; Digits only.',
    ]);
  });

  it.each([
    [
      "throws",
      z.string().refine((value) => BigInt(value) > 0n),
      "z.string().refine((value) => BigInt(value) > 0n)",
      'defaultValue is not a valid value of type Positive: "abc" is not a valid Positive: its validator threw (Cannot convert abc to a BigInt).',
    ],
    [
      "is async",
      z.string().refine((value) => Promise.resolve(value.length > 0)),
      "z.string().refine((value) => Promise.resolve(value.length > 0))",
      'defaultValue is not a valid value of type Positive: "abc" is not a valid Positive: its validator threw (Encountered Promise during synchronous parse. Use .parseAsync() instead).',
    ],
    [
      "throws a ZodError",
      z.string().transform((value) => String(z.number().parse(Number(value)))),
      "z.string().transform((value) => String(z.number().parse(Number(value))))",
      'defaultValue is not a valid value of type Positive: "abc" is not a valid Positive: its validator threw (Invalid input: expected number, received NaN).',
    ],
  ])("reports a validator that %s", (_, validator, zodSource, message) => {
    const Positive = defineScalar({
      name: "Positive",
      description: "A positive integer written as a string.",
      representation: "string",
      validator,
      zodSource,
    });
    expect(
      compileAndBuild(probe(Positive({ defaultValue: "abc" }))).refused.map(
        (diagnostic) => diagnostic.message,
      ),
    ).toStrictEqual([message]);
  });
});
