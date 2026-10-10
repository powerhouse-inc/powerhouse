import type {
  DocumentModelModule,
  DocumentSpecification,
} from "@powerhousedao/shared/document-model";
import { defineDocumentModel, ph, scalarCatalog } from "document-model";
import { schemaFirstGraphQLDocument } from "document-model/tooling";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { z } from "zod";
import { generateDocumentModelZodSchemas } from "../src/codegen/graphql.js";
import type { DocumentModelFileMakerArgs } from "../src/file-builders/index.mts";

const STATE_SDL = [
  "interface Named { name: String }",
  "interface Titled implements Named { name: String title: String }",
  "type Book implements Titled & Named { name: String title: String }",
  'type ProbeState { title: String items: [String]! book: Book code: String @equals(value: "abc") }',
].join("\n");

const OPERATIONS = {
  SET_TITLE: [
    "input TitleInner { a: String }",
    "input SetTitleInput { title: String tags: [String] inners: [TitleInner] }",
  ].join("\n"),
  SET_COUNT: "input SetCountInput { count: Int! = 3 limit: Int = 3 }",
  SET_DEFAULTS: [
    "enum Tone { LOW HIGH }",
    "input DefaultsInner { a: Int }",
    'input SetDefaultsInput { strReq: String! = "x" boolReq: Boolean! = true floatOpt: Float = 1.5 enumReq: Tone! = LOW enumOpt: Tone = LOW nullOpt: Int = null listReq: [Int!]! = [1] listOpt: [Int] = [1] objReq: DefaultsInner! = {a: 1} objOpt: DefaultsInner = {a: 1} }',
  ].join("\n"),
  SET_CODE: 'input SetCodeInput { code: String @equals(value: "abc") }',
};

function specification(): DocumentSpecification {
  return {
    version: 1,
    changeLog: [],
    state: {
      global: { schema: STATE_SDL, initialValue: "{}", examples: [] },
      local: { schema: "", initialValue: "", examples: [] },
    },
    modules: [
      {
        name: "probe",
        operations: Object.entries(OPERATIONS).map(([name, schema]) => ({
          name,
          schema,
        })),
      },
    ],
  } as unknown as DocumentSpecification;
}

type Schema = () => z.ZodType;

type Generated = {
  readonly ProbeStateSchema: Schema;
  readonly SetTitleInputSchema: Schema;
  readonly SetCountInputSchema: Schema;
  readonly SetDefaultsInputSchema: Schema;
  readonly SetCodeInputSchema: Schema;
  readonly TitledSchema: Schema;
};

let workDir: string;
let generated: Generated;

beforeAll(async () => {
  mkdirSync(join(import.meta.dirname, ".test-output"), { recursive: true });
  workDir = mkdtempSync(
    join(import.meta.dirname, ".test-output", "code-first-validator-parity-"),
  );
  const schemaDirPath = join(workDir, "gen", "schema");
  mkdirSync(schemaDirPath, { recursive: true });
  await generateDocumentModelZodSchemas({
    specification: specification(),
    schemaDirPath,
    versionDirPath: workDir,
  } as DocumentModelFileMakerArgs);
  generated = (await import(join(schemaDirPath, "zod.ts"))) as Generated;
});

afterAll(() => rmSync(workDir, { recursive: true, force: true }));

type ProbeDeclaration = {
  readonly state: Parameters<typeof ph.object>[1]["fields"];
  readonly initialValue: Record<string, unknown>;
  readonly input: ReturnType<typeof ph.input>;
  readonly graphQLCompatibility?: readonly string[];
};

function codeFirstModel(probe: ProbeDeclaration): DocumentModelModule {
  const context = defineDocumentModel({
    id: "test/code-first-validator-parity",
    name: "Probe",
    description: "",
    extension: "probe",
    version: 1,
    author: { name: "Powerhouse" },
    specifications: {
      ...(probe.graphQLCompatibility && {
        graphQLCompatibility: schemaFirstGraphQLDocument([
          ...probe.graphQLCompatibility,
        ]),
      }),
      global: {
        schema: ph.object("ProbeState", { fields: probe.state }),
        initialValue: probe.initialValue as never,
      },
      local: { schema: null, initialValue: {} },
    },
  });
  const module = context.module("probe", {
    operations: ({ global }) => ({
      probe: global({ input: probe.input, reduce() {} }),
    }),
  });
  return context.finalize({
    modules: [module],
  }) as unknown as DocumentModelModule;
}

function acceptsState(
  model: DocumentModelModule,
  global: Record<string, unknown>,
): boolean {
  return model.utils.isStateOfType({
    ...model.utils.createState(),
    global,
  } as never);
}

function callProbe(model: DocumentModelModule, input: unknown): unknown {
  return (model.actions as Record<string, (input: unknown) => unknown>).probe(
    input,
  );
}

function acceptsInput(model: DocumentModelModule, input: unknown): boolean {
  try {
    callProbe(model, input);
    return true;
  } catch {
    return false;
  }
}

function refusalIssues(model: DocumentModelModule, input: unknown): unknown {
  try {
    callProbe(model, input);
  } catch (error) {
    return (error as { issues?: unknown }).issues;
  }
}

type Case = readonly [string, unknown];

function stateVerdicts(model: DocumentModelModule, cases: readonly Case[]) {
  return cases.map(([name, value]) => [
    name,
    generated.ProbeStateSchema().safeParse(value).success,
    acceptsState(model, value as Record<string, unknown>),
  ]);
}

function inputVerdicts(
  schema: Schema,
  model: DocumentModelModule,
  cases: readonly Case[],
) {
  return cases.map(([name, value]) => [
    name,
    schema().safeParse(value).success,
    acceptsInput(model, value),
  ]);
}

describe("nullability by slot against the schema-first generator", () => {
  const TitleInner = ph.input("TitleInner", { fields: { a: ph.String() } });
  const probe = (): DocumentModelModule =>
    codeFirstModel({
      state: {
        title: ph.String(),
        items: ph.list(ph.String(), { required: true }),
      },
      initialValue: { title: null, items: [] },
      input: ph.input({
        fields: {
          title: ph.String(),
          tags: ph.list(ph.String()),
          inners: ph.list(ph.ref(TitleInner)),
        },
      }),
    });

  it("accepts and rejects the same stored states", () => {
    expect(
      stateVerdicts(probe(), [
        ["nullable field present", { title: "t", items: [] }],
        ["nullable field null", { title: null, items: [] }],
        ["nullable field absent", { items: [] }],
        ["nullable list item null", { title: null, items: [null] }],
        ["nullable list item undefined", { title: null, items: [undefined] }],
        ["required field absent", { title: "t" }],
      ]),
    ).toStrictEqual([
      ["nullable field present", true, true],
      ["nullable field null", true, true],
      ["nullable field absent", true, true],
      ["nullable list item null", true, true],
      ["nullable list item undefined", false, false],
      ["required field absent", false, false],
    ]);
  });

  it("accepts and rejects the same operation inputs", () => {
    expect(
      inputVerdicts(generated.SetTitleInputSchema, probe(), [
        ["nullable field absent", {}],
        ["nullable field null", { title: null }],
        ["nullable scalar item null", { tags: [null] }],
        ["nullable scalar item undefined", { tags: [undefined] }],
        ["nullable input item null", { inners: [null] }],
        ["nullable input item undefined", { inners: [undefined] }],
        ["nested nullable field absent", { inners: [{}] }],
      ]),
    ).toStrictEqual([
      ["nullable field absent", true, true],
      ["nullable field null", true, true],
      ["nullable scalar item null", true, true],
      ["nullable scalar item undefined", false, false],
      ["nullable input item null", true, true],
      ["nullable input item undefined", false, false],
      ["nested nullable field absent", true, true],
    ]);
  });
});

describe("interfaces that implement interfaces against the schema-first generator", () => {
  const declare = () => {
    const Named = ph.interface("Named", { fields: { name: ph.String() } });
    const Titled = ph.interface("Titled", {
      fields: { name: ph.String(), title: ph.String() },
      implements: [Named],
    });
    const Book = ph.object("Book", {
      fields: { name: ph.String(), title: ph.String() },
      implements: [Titled, Named],
    });
    const model = codeFirstModel({
      state: {
        items: ph.list(ph.String(), { required: true }),
        book: ph.ref(Book),
      },
      initialValue: { items: [], book: null },
      input: ph.input({ fields: { title: ph.String() } }),
    });
    return { Titled, model };
  };

  it("accepts and rejects the same stored implementing objects", () => {
    expect(
      stateVerdicts(declare().model, [
        ["implementing object", { items: [], book: { name: "n", title: "t" } }],
        ["implementing object, wrong type", { items: [], book: { name: 1 } }],
        ["implementing object, empty", { items: [], book: {} }],
        ["no implementing object", { items: [], book: null }],
      ]),
    ).toStrictEqual([
      ["implementing object", true, true],
      ["implementing object, wrong type", false, false],
      ["implementing object, empty", true, true],
      ["no implementing object", true, true],
    ]);
  });

  it("validates the implementing interface with its own fields only", () => {
    const { Titled } = declare();
    const cases = [{ name: "n", title: "t" }, { title: 1 }, {}, { extra: 1 }];
    expect(
      cases.map((value) => [
        generated.TitledSchema().safeParse(value).success,
        Titled.validator.safeParse(value).success,
      ]),
    ).toStrictEqual([
      [true, true],
      [false, false],
      [true, true],
      [true, true],
    ]);
  });
});

describe("input field defaults against the schema-first generator", () => {
  const probe = (graphQLCompatibility?: readonly string[]) =>
    codeFirstModel({
      state: { title: ph.String() },
      initialValue: { title: null },
      input: ph.input({
        fields: {
          count: ph.Int({ required: true, defaultValue: 3 }),
          limit: ph.Int({ defaultValue: 3 }),
        },
      }),
      ...(graphQLCompatibility && { graphQLCompatibility }),
    });
  const cases: readonly Case[] = [
    ["both absent", {}],
    ["both given", { count: 5, limit: 6 }],
    ["required defaulted field null", { count: null }],
    ["nullable defaulted field null", { limit: null }],
    ["required defaulted field, wrong type", { count: "x" }],
    ["nullable defaulted field, wrong type", { limit: "x" }],
  ];
  const expected = [
    ["both absent", true, true],
    ["both given", true, true],
    ["required defaulted field null", false, false],
    ["nullable defaulted field null", true, true],
    ["required defaulted field, wrong type", false, false],
    ["nullable defaulted field, wrong type", false, false],
  ];

  it("accepts and rejects the same operation inputs", () => {
    expect(
      inputVerdicts(generated.SetCountInputSchema, probe(), cases),
    ).toStrictEqual(expected);
  });

  it("agrees with a compatibility AST that declares the same defaults", () => {
    const model = probe([
      "type ProbeState { title: String }",
      OPERATIONS.SET_COUNT.replace("SetCountInput", "ProbeInput"),
    ]);
    expect(
      inputVerdicts(generated.SetCountInputSchema, model, cases),
    ).toStrictEqual(expected);
  });
});

describe("every default kind against the schema-first generator", () => {
  const probe = () => {
    const Tone = ph.enum("Tone", { values: ["LOW", "HIGH"] });
    const DefaultsInner = ph.input("DefaultsInner", {
      fields: { a: ph.Int() },
    });
    return codeFirstModel({
      state: { title: ph.String() },
      initialValue: { title: null },
      input: ph.input({
        fields: {
          strReq: ph.String({ required: true, defaultValue: "x" }),
          boolReq: ph.Boolean({ required: true, defaultValue: true }),
          floatOpt: ph.Float({ defaultValue: 1.5 }),
          enumReq: ph.ref(Tone, { required: true, defaultValue: "LOW" }),
          enumOpt: ph.ref(Tone, { defaultValue: "LOW" }),
          nullOpt: ph.Int({ defaultValue: null }),
          listReq: ph.list(ph.Int({ required: true }), {
            required: true,
            defaultValue: [1],
          }),
          listOpt: ph.list(ph.Int(), { defaultValue: [1] }),
          objReq: ph.ref(DefaultsInner, {
            required: true,
            defaultValue: { a: 1 },
          }),
          objOpt: ph.ref(DefaultsInner, { defaultValue: { a: 1 } }),
        },
      }),
    });
  };
  const given = { listReq: [1], objReq: { a: 1 } };

  it("applies only the scalar and enum defaults, as the generator does", () => {
    expect(
      inputVerdicts(generated.SetDefaultsInputSchema, probe(), [
        ["everything absent", {}],
        ["list and object given", given],
        ["required list absent", { objReq: { a: 1 } }],
        ["required object absent", { listReq: [1] }],
        ["required object null", { ...given, objReq: null }],
        ["enum outside its values", { ...given, enumReq: "BAD" }],
        ["required scalar null", { ...given, strReq: null }],
      ]),
    ).toStrictEqual([
      ["everything absent", false, false],
      ["list and object given", true, true],
      ["required list absent", false, false],
      ["required object absent", false, false],
      ["required object null", false, false],
      ["enum outside its values", false, false],
      ["required scalar null", false, false],
    ]);
  });

  it("refuses an empty input with the generator's issues", () => {
    expect(refusalIssues(probe(), {})).toStrictEqual(
      generated.SetDefaultsInputSchema().safeParse({}).error?.issues,
    );
  });
});

describe("@equals against the schema-first generator", () => {
  const probe = (graphQLCompatibility?: readonly string[]) =>
    codeFirstModel({
      state: {
        title: ph.String(),
        items: ph.list(ph.String(), { required: true }),
        code: ph.String({ equals: "abc" }),
      },
      initialValue: { title: null, items: [], code: null },
      input: ph.input({ fields: { code: ph.String({ equals: "abc" }) } }),
      ...(graphQLCompatibility && { graphQLCompatibility }),
    });

  it("accepts and rejects the same stored states", () => {
    expect(
      stateVerdicts(probe(), [
        ["equal value", { items: [], code: "abc" }],
        ["different value", { items: [], code: "xyz" }],
        ["value with the pattern inside", { items: [], code: "xabcx" }],
        ["null", { items: [], code: null }],
        ["absent", { items: [] }],
      ]),
    ).toStrictEqual([
      ["equal value", true, true],
      ["different value", false, false],
      ["value with the pattern inside", false, false],
      ["null", true, true],
      ["absent", true, true],
    ]);
  });

  const inputCases: readonly Case[] = [
    ["equal value", { code: "abc" }],
    ["different value", { code: "xyz" }],
    ["null", { code: null }],
    ["absent", {}],
    ["wrong type", { code: 1 }],
  ];
  const inputExpected = [
    ["equal value", true, true],
    ["different value", false, false],
    ["null", true, true],
    ["absent", true, true],
    ["wrong type", false, false],
  ];

  it("accepts and rejects the same operation inputs", () => {
    expect(
      inputVerdicts(generated.SetCodeInputSchema, probe(), inputCases),
    ).toStrictEqual(inputExpected);
  });

  it("refuses a different value with the generator's issues", () => {
    expect(refusalIssues(probe(), { code: "xyz" })).toStrictEqual(
      generated.SetCodeInputSchema().safeParse({ code: "xyz" }).error?.issues,
    );
  });

  it("agrees with a compatibility AST that declares the same @equals", () => {
    const model = probe([
      'type ProbeState { title: String items: [String]! code: String @equals(value: "abc") }',
      OPERATIONS.SET_CODE.replace("SetCodeInput", "ProbeInput"),
    ]);
    expect(
      inputVerdicts(generated.SetCodeInputSchema, model, inputCases),
    ).toStrictEqual(inputExpected);
  });
});

describe("@equals on every scalar against the schema-first generator", () => {
  const BUILT_INS = ["String", "ID", "Int", "Float", "Boolean"] as const;

  function builder(name: string): (options: object) => {
    readonly validator: z.ZodType;
  } {
    const builders = ph as unknown as Record<string, unknown>;
    if ((BUILT_INS as readonly string[]).includes(name)) {
      return builders[name] as never;
    }
    return Object.values(builders).find(
      (candidate) =>
        (candidate as { definition?: { name?: string } }).definition?.name ===
        name,
    ) as never;
  }

  async function generatedField(
    name: string,
    pattern = "a.c",
  ): Promise<z.ZodType | null> {
    const root = mkdtempSync(join(workDir, `equals-${name}-`));
    const schemaDirPath = join(root, "gen", "schema");
    mkdirSync(schemaDirPath, { recursive: true });
    try {
      await generateDocumentModelZodSchemas({
        specification: {
          version: 1,
          changeLog: [],
          state: {
            global: {
              schema: `type ProbeState { f: ${name} @equals(value: ${JSON.stringify(pattern)}) }`,
              initialValue: "{}",
              examples: [],
            },
            local: { schema: "", initialValue: "", examples: [] },
          },
          modules: [],
        } as unknown as DocumentSpecification,
        schemaDirPath,
        versionDirPath: root,
      } as DocumentModelFileMakerArgs);
      const module = (await import(join(schemaDirPath, "zod.ts"))) as {
        ProbeStateSchema: () => z.ZodObject<{ f: z.ZodType }>;
      };
      return module.ProbeStateSchema().shape.f;
    } catch {
      return null;
    }
  }

  it("accepts equals exactly where the generated validator can carry it", async () => {
    const values = ["abc", "a-c", "abcd", "a@b.co"];
    const verdicts: Record<string, readonly unknown[]> = {};
    for (const name of [...BUILT_INS, ...scalarCatalog.names]) {
      const generatedValidator = await generatedField(name);
      let codeFirst: z.ZodType | null;
      try {
        codeFirst = builder(name)({ equals: "a.c" }).validator;
      } catch {
        codeFirst = null;
      }
      verdicts[name] = [generatedValidator, codeFirst].map((validator) =>
        validator === null
          ? "refused"
          : values.map((value) => validator.safeParse(value).success),
      );
    }
    expect(
      Object.entries(verdicts).filter(
        ([, [generator, codeFirst]]) =>
          JSON.stringify(generator) !== JSON.stringify(codeFirst),
      ),
    ).toStrictEqual([]);
    expect(
      Object.entries(verdicts)
        .filter(([, [generator]]) => generator !== "refused")
        .map(([name]) => name),
    ).toStrictEqual([
      "String",
      "ID",
      "PHID",
      "OID",
      "OLabel",
      "Currency",
      "EmailAddress",
      "EthereumAddress",
      "URL",
      "Date",
      "DateTime",
    ]);
  });

  it("accepts exactly the patterns the generated regex literal can carry", async () => {
    const values = [
      "a/b",
      "/",
      "abc",
      "12",
      "a",
      "a\\/b",
      "&",
      "$",
      "1",
      "^",
      "a$1b",
      "ab",
    ];
    const outcomes: Record<string, readonly unknown[]> = {};
    for (const pattern of [
      "a\\/b",
      "[/]",
      "a.c",
      "\\d+",
      "a|b",
      "a/b",
      "x/",
      "a\nb",
      "a\rb",
      "[$&]",
      "[$`]",
      "[$']",
      "[$$]",
      "a$1b",
      "a$'b",
    ]) {
      let codeFirst: z.ZodType | null;
      try {
        codeFirst = ph.String({ equals: pattern }).validator;
      } catch {
        codeFirst = null;
      }
      outcomes[pattern] = [
        await generatedField("String", pattern),
        codeFirst,
      ].map((validator) => {
        if (validator === null) return "refused";
        try {
          return values.map((value) => validator.safeParse(value).success);
        } catch {
          return "refused";
        }
      });
    }
    expect(
      Object.entries(outcomes).filter(
        ([, [generator, codeFirst]]) =>
          JSON.stringify(generator) !== JSON.stringify(codeFirst),
      ),
    ).toStrictEqual([]);
    expect(
      Object.entries(outcomes)
        .filter(([, [generator]]) => generator === "refused")
        .map(([pattern]) => pattern),
    ).toStrictEqual(["a/b", "x/", "a\nb", "a\rb", "a$'b"]);
  });
});
