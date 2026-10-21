import type { DocumentSpecification } from "@powerhousedao/shared/document-model";
import {
  createState,
  defaultBaseState,
} from "@powerhousedao/shared/document-model";
import { printSchemaSegment } from "document-model";
import {
  adaptSchemaFirstDocumentModelModule,
  checkRetainedSerialization,
} from "document-model/tooling";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { z } from "zod";
import { generateDocumentModelZodSchemas } from "../src/codegen/graphql.js";
import type { DocumentModelFileMakerArgs } from "../src/file-builders/index.mts";

type Layout = {
  readonly layout: string;
  readonly global: string;
  readonly initialValue: string;
  readonly operations: Readonly<Record<string, string>>;
  readonly values: readonly (readonly [string, unknown])[];
} & (
  | { readonly adapter: "accepts"; readonly generated: readonly boolean[] }
  | { readonly adapter: "rejects"; readonly generated: "fails" }
  | { readonly adapter: "rejects"; readonly generated: readonly boolean[] }
);

const LAYOUTS: readonly Layout[] = [
  {
    layout: "a later repeat that drops a field",
    global: "type TodoState { x: Int! }",
    initialValue: '{"x":1}',
    operations: {
      FIRST: "input S { a: Int! b: Int! }\ninput FirstInput { s: S! }",
      SECOND: "input S { a: Int! }\ninput SecondInput { s: S! }",
    },
    values: [
      ["FirstInput", { s: { a: 1, b: 2 } }],
      ["FirstInput", { s: { a: 1 } }],
      ["SecondInput", { s: { a: 1, b: 2 } }],
      ["SecondInput", { s: { a: 1 } }],
    ],
    adapter: "rejects",
    generated: [true, false, true, false],
  },
  {
    layout: "a later repeat that adds a field",
    global: "type TodoState { x: Int! }",
    initialValue: '{"x":1}',
    operations: {
      FIRST: "input S { a: Int! }\ninput FirstInput { s: S! }",
      SECOND: "input S { a: Int! b: Int! }\ninput SecondInput { s: S! }",
    },
    values: [
      ["FirstInput", { s: { a: 1, b: 2 } }],
      ["FirstInput", { s: { a: 1 } }],
      ["SecondInput", { s: { a: 1, b: 2 } }],
      ["SecondInput", { s: { a: 1 } }],
    ],
    adapter: "accepts",
    generated: [true, false, true, false],
  },
  {
    layout: "a repeat that differs only in descriptions",
    global: "type TodoState { x: Int! }",
    initialValue: '{"x":1}',
    operations: {
      FIRST: "input S { a: Int! }\ninput FirstInput { s: S! }",
      SECOND:
        '"shared"\ninput S { "field" a: Int! }\ninput SecondInput { s: S! }',
    },
    values: [
      ["FirstInput", { s: { a: 1 } }],
      ["FirstInput", { s: {} }],
      ["SecondInput", { s: { a: "no" } }],
    ],
    adapter: "accepts",
    generated: [true, false, false],
  },
  {
    layout: "a repeat that differs only in deprecation",
    global: "type TodoState { x: Int! }",
    initialValue: '{"x":1}',
    operations: {
      FIRST: "input S { a: Int }\ninput FirstInput { s: S! }",
      SECOND: "input S { a: Int @deprecated }\ninput SecondInput { s: S! }",
    },
    values: [
      ["FirstInput", { s: { a: 1 } }],
      ["FirstInput", { s: { a: "no" } }],
    ],
    adapter: "accepts",
    generated: [true, false],
  },
  {
    layout: "a repeat that gives a field another type",
    global: "type TodoState { x: Int! }",
    initialValue: '{"x":1}',
    operations: {
      FIRST: "input S { a: Int! }\ninput FirstInput { s: S! }",
      SECOND: "input S { a: String! }\ninput SecondInput { s: S! }",
    },
    values: [
      ["FirstInput", { s: { a: 1 } }],
      ["FirstInput", { s: { a: "x" } }],
    ],
    adapter: "rejects",
    generated: "fails",
  },
  {
    layout: "a later repeat that makes a field required",
    global: "type TodoState { x: Int! }",
    initialValue: '{"x":1}',
    operations: {
      FIRST: "input S { a: Int }\ninput FirstInput { s: S! }",
      SECOND: "input S { a: Int! }\ninput SecondInput { s: S! }",
    },
    values: [
      ["FirstInput", { s: {} }],
      ["FirstInput", { s: { a: 1 } }],
      ["SecondInput", { s: {} }],
    ],
    adapter: "accepts",
    generated: [false, true, false],
  },
  {
    layout: "a later enum repeat that adds a value",
    global: "type TodoState { e: E! }\nenum E { OPEN }",
    initialValue: '{"e":"OPEN"}',
    operations: {
      SET_X: "enum E { OPEN CLOSED }\ninput SetXInput { x: Int! }",
    },
    values: [
      ["TodoState", { e: "OPEN" }],
      ["TodoState", { e: "CLOSED" }],
      ["TodoState", { e: "BOGUS" }],
    ],
    adapter: "accepts",
    generated: [true, true, false],
  },
  {
    layout: "a later enum repeat that drops a value",
    global: "type TodoState { e: E! }\nenum E { OPEN CLOSED }",
    initialValue: '{"e":"OPEN"}',
    operations: { SET_X: "enum E { OPEN }\ninput SetXInput { x: Int! }" },
    values: [
      ["TodoState", { e: "OPEN" }],
      ["TodoState", { e: "CLOSED" }],
    ],
    adapter: "rejects",
    generated: [true, true],
  },
  {
    layout: "an object and a later enum of one name",
    global:
      "type TodoState { c: ContractType }\ntype ContractType { label: String }\nenum ContractType { FULL_TIME PART_TIME }",
    initialValue: '{"c":null}',
    operations: { SET_X: "input SetXInput { x: Int! }" },
    values: [
      ["TodoState", { c: "FULL_TIME" }],
      ["TodoState", { c: { label: "a" } }],
      ["TodoState", { c: "BOGUS" }],
    ],
    adapter: "accepts",
    generated: [true, false, false],
  },
  {
    layout: "an enum and a later object of one name",
    global:
      "type TodoState { c: ContractType }\nenum ContractType { FULL_TIME PART_TIME }\ntype ContractType { label: String }",
    initialValue: '{"c":null}',
    operations: { SET_X: "input SetXInput { x: Int! }" },
    values: [
      ["TodoState", { c: "FULL_TIME" }],
      ["TodoState", { c: { label: "a" } }],
      ["TodoState", { c: "BOGUS" }],
    ],
    adapter: "accepts",
    generated: [false, true, false],
  },
  {
    layout: "an object and an enum of one name in different schemas",
    global:
      "type TodoState { c: ContractType }\ntype ContractType { label: String }",
    initialValue: '{"c":null}',
    operations: {
      SET_X: "enum ContractType { FULL_TIME }\ninput SetXInput { x: Int! }",
    },
    values: [
      ["TodoState", { c: "FULL_TIME" }],
      ["TodoState", { c: { label: "a" } }],
    ],
    adapter: "accepts",
    generated: [true, false],
  },
  {
    layout: "an object and a later input of one name",
    global: "type TodoState { x: Int! }\ntype S { a: Int! }",
    initialValue: '{"x":1}',
    operations: { SET_X: "input S { b: Int! }\ninput SetXInput { s: S! }" },
    values: [
      ["SetXInput", { s: { b: 1 } }],
      ["SetXInput", { s: { a: 1 } }],
    ],
    adapter: "rejects",
    generated: [false, false],
  },
  {
    layout: "a repeat beside an extension",
    global: "type TodoState { x: Int! }",
    initialValue: '{"x":1}',
    operations: {
      FIRST: "input S { a: Int! }\ninput FirstInput { s: S! }",
      SECOND: "input S { a: Int! b: Int! }\ninput SecondInput { s: S! }",
      THIRD: "extend input S { c: Int! }\ninput ThirdInput { x: Int }",
    },
    values: [
      ["FirstInput", { s: { a: 1, b: 2, c: 3 } }],
      ["FirstInput", { s: { a: 1, b: 2 } }],
      ["SecondInput", { s: { a: 1, b: 2 } }],
    ],
    adapter: "rejects",
    generated: [true, false, false],
  },
  {
    layout: "a superset repeat inside one schema",
    global:
      "type TodoState { title: String }\ntype TodoState { title: String x: Int }",
    initialValue: '{"title":null,"x":null}',
    operations: { SET_X: "input SetXInput { x: Int! }" },
    values: [
      ["TodoState", { title: "t", x: 1 }],
      ["TodoState", { title: "t", x: "no" }],
    ],
    adapter: "accepts",
    generated: [true, false],
  },
  {
    layout: "a disjoint repeat inside one schema",
    global: "type TodoState { title: String }\ntype TodoState { x: Int }",
    initialValue: '{"title":null,"x":null}',
    operations: { SET_X: "input SetXInput { x: Int! }" },
    values: [
      ["TodoState", { title: "t", x: 1 }],
      ["TodoState", { title: 1, x: 1 }],
      ["TodoState", { title: "t", x: "no" }],
    ],
    adapter: "rejects",
    generated: [true, false, false],
  },
  {
    layout: "an operation input a later schema repeats with a description",
    global: "type TodoState { x: Int! }",
    initialValue: '{"x":1}',
    operations: {
      SET_X: "input SetXInput { x: Int! }",
      OTHER:
        '"later"\ninput SetXInput { x: Int! }\ninput OtherInput { y: Int }',
    },
    values: [
      ["SetXInput", { x: 1 }],
      ["SetXInput", { x: "no" }],
    ],
    adapter: "accepts",
    generated: [true, false],
  },
  {
    layout: "an operation input a later schema repeats with another field",
    global: "type TodoState { x: Int! }",
    initialValue: '{"x":1}',
    operations: {
      SET_X: "input SetXInput { x: Int! }",
      OTHER: "input SetXInput { x: Int! y: Int! }\ninput OtherInput { y: Int }",
    },
    values: [
      ["SetXInput", { x: 1, y: 2 }],
      ["SetXInput", { x: 1 }],
    ],
    adapter: "rejects",
    generated: [true, false],
  },
  {
    layout: "a later union repeat that adds a member",
    global:
      "type TodoState { u: U! }\ntype A { a: Int! }\ntype B { b: Int! }\nunion U = A",
    initialValue: '{"u":{"a":1}}',
    operations: { SET_X: "union U = A | B\ninput SetXInput { x: Int! }" },
    values: [
      ["TodoState", { u: { a: 1 } }],
      ["TodoState", { u: { b: 1 } }],
    ],
    adapter: "accepts",
    generated: [true, true],
  },
  {
    layout: "a later repeat that implements an interface",
    global:
      "interface I { id: String }\ntype TodoState { x: X! }\ntype X { id: String a: Int! }",
    initialValue: '{"x":{"id":"i","a":1}}',
    operations: {
      SET_X:
        "type X implements I { id: String a: Int! }\ninput SetXInput { x: Int! }",
    },
    values: [
      ["TodoState", { x: { id: "i", a: 1 } }],
      ["TodoState", { x: { id: "i", a: "no" } }],
    ],
    adapter: "accepts",
    generated: [true, false],
  },
  {
    layout: "a later repeat that adds a field argument",
    global: "type TodoState { x: X! }\ntype X { a(n: Int): Int! }",
    initialValue: '{"x":{"a":1}}',
    operations: {
      SET_X:
        "type X { a(n: Int, m: String): Int! }\ninput SetXInput { x: Int! }",
    },
    values: [
      ["TodoState", { x: { a: 1 } }],
      ["TodoState", { x: { a: "no" } }],
    ],
    adapter: "accepts",
    generated: [true, false],
  },
  {
    layout: "a later repeat that makes a list item required",
    global: "type TodoState { x: Int! }",
    initialValue: '{"x":1}',
    operations: {
      FIRST: "input S { a: [Int] }\ninput FirstInput { s: S! }",
      SECOND: "input S { a: [Int!] }\ninput SecondInput { s: S! }",
    },
    values: [
      ["FirstInput", { s: { a: [null] } }],
      ["FirstInput", { s: { a: [1] } }],
    ],
    adapter: "rejects",
    generated: [true, true],
  },
  {
    layout: "a repeat that adds a directive the generator ignores",
    global:
      "directive @tag on INPUT_FIELD_DEFINITION\ntype TodoState { x: Int! }",
    initialValue: '{"x":1}',
    operations: {
      FIRST: "input S { a: String }\ninput FirstInput { s: S! }",
      SECOND: "input S { a: String @tag }\ninput SecondInput { s: S! }",
    },
    values: [
      ["FirstInput", { s: { a: "x" } }],
      ["FirstInput", { s: { a: 1 } }],
    ],
    adapter: "accepts",
    generated: [true, false],
  },
  {
    layout: "a repeat that adds a null default",
    global: "type TodoState { x: Int! }",
    initialValue: '{"x":1}',
    operations: {
      FIRST: "input S { a: String }\ninput FirstInput { s: S! }",
      SECOND: "input S { a: String = null }\ninput SecondInput { s: S! }",
    },
    values: [
      ["FirstInput", { s: {} }],
      ["FirstInput", { s: { a: 1 } }],
    ],
    adapter: "accepts",
    generated: [true, false],
  },
  {
    layout: "repeats with different list defaults",
    global: "type TodoState { x: Int! }",
    initialValue: '{"x":1}',
    operations: {
      FIRST: 'input S { a: [String]! = ["a"] }\ninput FirstInput { s: S! }',
      SECOND: 'input S { a: [String]! = ["b"] }\ninput SecondInput { s: S! }',
    },
    values: [
      ["FirstInput", { s: {} }],
      ["FirstInput", { s: { a: ["x"] } }],
    ],
    adapter: "accepts",
    generated: [false, true],
  },
  {
    layout: "repeats with different object defaults",
    global: "type TodoState { x: Int! }\ninput N { b: Int }",
    initialValue: '{"x":1}',
    operations: {
      FIRST: "input S { a: N = { b: 1 } }\ninput FirstInput { s: S! }",
      SECOND: "input S { a: N = { b: 2 } }\ninput SecondInput { s: S! }",
    },
    values: [
      ["FirstInput", { s: {} }],
      ["FirstInput", { s: { a: { b: "no" } } }],
    ],
    adapter: "accepts",
    generated: [true, false],
  },
  {
    layout: "three repeats whose middle one adds a default",
    global: "type TodoState { x: Int! }",
    initialValue: '{"x":1}',
    operations: {
      FIRST: "input S { a: Int }\ninput FirstInput { s: S! }",
      SECOND:
        "input S { a: Int = 1 }\ninput S { a: Int }\ninput SecondInput { s: S! }",
    },
    values: [
      ["FirstInput", { s: {} }],
      ["FirstInput", { s: { a: "no" } }],
    ],
    adapter: "accepts",
    generated: [true, false],
  },
  {
    layout:
      "a list field whose repeat changes a scalar default the generator drops",
    global: "type TodoState { x: Int! }\ninput H { x: [Int]! = 1 }",
    initialValue: '{"x":1}',
    operations: {
      SET_X: "input H { x: [Int]! = 2 }\ninput SetXInput { h: H }",
    },
    values: [
      ["H", {}],
      ["H", { x: [1, null] }],
      ["H", { x: ["no"] }],
    ],
    adapter: "accepts",
    generated: [false, true, false],
  },
  {
    layout: "a required list field whose repeat drops @equals",
    global:
      'type TodoState { x: Int! }\ninput H { x: [String]! @equals(value: "abc") }',
    initialValue: '{"x":1}',
    operations: { SET_X: "input H { x: [String]! }\ninput SetXInput { h: H }" },
    values: [
      ["H", { x: ["zzz"] }],
      ["H", { x: "zzz" }],
    ],
    adapter: "accepts",
    generated: [true, false],
  },
  {
    layout: "a repeat that drops an @equals argument the generator ignores",
    global:
      'directive @equals(value: String, ignored: Int) on INPUT_FIELD_DEFINITION\ntype TodoState { x: Int! }\ninput H { x: String @equals(value: "abc", ignored: 1) }',
    initialValue: '{"x":1}',
    operations: {
      SET_X:
        'input H { x: String @equals(value: "abc") }\ninput SetXInput { h: H }',
    },
    values: [
      ["H", { x: "abc" }],
      ["H", { x: "abd" }],
    ],
    adapter: "accepts",
    generated: [true, false],
  },
  {
    layout: "a later repeat that adds a field argument to the arguments schema",
    global: "type TodoState { x: Int! }\ntype H { x(a: Int): String }",
    initialValue: '{"x":1}',
    operations: {
      SET_X: "type H { x(a: Int, b: Int): String }\ninput SetXInput { y: Int }",
    },
    values: [
      ["HXArgs", { b: 1 }],
      ["HXArgs", { b: "no" }],
    ],
    adapter: "accepts",
    generated: [true, false],
  },
  {
    layout: "a later repeat that drops a defaulted field argument",
    global:
      "type TodoState { x: Int! }\ntype H { x(a: Int! = 1, b: Int! = 2): String }",
    initialValue: '{"x":1}',
    operations: {
      SET_X: "type H { x(a: Int! = 1): String }\ninput SetXInput { y: Int }",
    },
    values: [
      ["HXArgs", {}],
      ["HXArgs", { b: "wrong" }],
    ],
    adapter: "rejects",
    generated: [true, false],
  },
];

function specification(
  layout: Pick<Layout, "global" | "initialValue" | "operations">,
): DocumentSpecification {
  return {
    version: 1,
    changeLog: [],
    state: {
      global: {
        schema: layout.global,
        initialValue: layout.initialValue,
        examples: [],
      },
      local: { schema: "", initialValue: "", examples: [] },
    },
    modules: [
      {
        id: "ops",
        name: "ops",
        description: "",
        operations: Object.entries(layout.operations).map(([name, schema]) => ({
          id: name,
          name,
          description: "",
          scope: "global",
          schema,
          errors: [],
          examples: [],
          template: "",
          reducer: "",
        })),
      },
    ],
  };
}

function adapt(layout: Layout) {
  return adaptSchemaFirstDocumentModelModule(
    createState(defaultBaseState(), {
      id: "test/repeat-parity",
      name: "Todo",
      description: "",
      extension: "todo",
      author: { name: "Powerhouse", website: null },
      specifications: [specification(layout)],
    }),
    { specifier: "./repeat-parity.js" },
  );
}

let workDir: string;

beforeAll(() => {
  mkdirSync(join(import.meta.dirname, ".test-output"), { recursive: true });
  workDir = mkdtempSync(
    join(import.meta.dirname, ".test-output", "schema-first-repeat-parity-"),
  );
});

afterAll(() => rmSync(workDir, { recursive: true, force: true }));

async function generatedVerdicts(
  layout: Pick<Layout, "global" | "initialValue" | "operations" | "values">,
): Promise<readonly boolean[]> {
  const schemaDirPath = mkdtempSync(join(workDir, "layout-"));
  await generateDocumentModelZodSchemas({
    specification: specification(layout),
    schemaDirPath,
    versionDirPath: schemaDirPath,
  } as DocumentModelFileMakerArgs);
  const generated = (await import(join(schemaDirPath, "zod.ts"))) as Record<
    string,
    () => z.ZodType
  >;
  return layout.values.map(
    ([type, value]) => generated[`${type}Schema`]().safeParse(value).success,
  );
}

describe("a type name the stored schemas declare more than once", () => {
  it.each(LAYOUTS)("$layout: the adapter $adapter it", async (layout) => {
    const result = adapt(layout);
    if (layout.generated === "fails") {
      await expect(generatedVerdicts(layout)).rejects.toThrow(
        /Unable to merge GraphQL/,
      );
      expect(result.artifacts).toStrictEqual([]);
      return;
    }
    expect(await generatedVerdicts(layout)).toStrictEqual(layout.generated);
    if (layout.adapter === "rejects") {
      expect(result.artifacts).toStrictEqual([]);
      expect(result.diagnostics.map(({ code }) => code)).toStrictEqual([
        "PH-DM-DECLARATION-INVALID",
      ]);
      return;
    }
    expect(result.diagnostics).toStrictEqual([]);
    const [artifact] = result.artifacts;
    expect(checkRetainedSerialization(artifact)).toStrictEqual([]);
    const [adapted] = artifact.definition.specifications;
    // The generator again, on the one declaration of each name the artifact
    // keeps instead of the stored repeats.
    const kept = await generatedVerdicts({
      ...layout,
      global: printSchemaSegment([
        ...adapted.types,
        ...adapted.modules.flatMap((module) =>
          module.operations.flatMap((operation) =>
            operation.input === null ? [] : [operation.input],
          ),
        ),
      ]),
      operations: Object.fromEntries(
        Object.keys(layout.operations).map((name) => [name, ""]),
      ),
    });
    expect(kept).toStrictEqual(layout.generated);
  });
});
