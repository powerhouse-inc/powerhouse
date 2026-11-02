import type {
  Action,
  DocumentModelGlobalState,
  DocumentSpecification,
  ModuleSpecification,
  PHBaseState,
  Reducer,
} from "document-model";
import { baseCreateDocument, defaultBaseState } from "document-model";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Project, SyntaxKind } from "ts-morph";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { z } from "zod";
import { generateDocumentModel } from "./generate.js";
import { buildMigrationPlan } from "../file-builders/document-model/upgrade-migration.js";
import { tsConfigTemplate } from "../templates/boilerplate/tsconfig.json.js";
import { buildTsMorphProject } from "../utils/ts-morph-project.js";

const scalarsModule = `import { defineScalar } from "document-model/scalars";
import { z } from "zod";

export const Iban = defineScalar({
  name: "Iban",
  description: "International bank account number",
  schema: z.string().regex(/^[A-Z]{2}\\d{2}[A-Z0-9]{11,30}$/),
  example: "DE89370400440532013000",
});

export const Bic = defineScalar({
  name: "Bic",
  schema: z.string().regex(/^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/),
});
`;

const stateSchema = `scalar Iban
scalar Bic

type PaymentFixtureState {
  iban: Iban
  accounts: [Iban!]!
  bic: Bic
}`;

const operationSchema = `input BankInput {
  bic: Bic!
}

input PayeeInput {
  iban: Iban!
  bank: BankInput
  name: String
}

input SetPaymentInput {
  iban: Iban!
  payee: Iban
  bic: Bic!
  accounts: [Iban!]!
  payees: [Iban]
  payeeGroups: [[Bic!]!]
  beneficiary: PayeeInput!
  beneficiaries: [PayeeInput!]
  note: String
}`;

function paymentsModule(
  operations: Record<string, string>,
): ModuleSpecification {
  return {
    id: "payments",
    name: "payments",
    description: null,
    operations: Object.entries(operations).map(([name, schema]) => ({
      id: name.toLowerCase().replaceAll("_", "-"),
      name,
      description: null,
      scope: "global",
      schema,
      reducer: null,
      template: null,
      errors: [],
      examples: [],
    })),
  };
}

function specification(
  state: string,
  operation: string | null,
  initialValue = "{}",
): DocumentSpecification {
  return {
    version: 1,
    changeLog: [],
    state: {
      global: { schema: state, initialValue, examples: [] },
      local: { schema: "", initialValue: "{}", examples: [] },
    },
    modules: operation ? [paymentsModule({ SET_PAYMENT: operation })] : [],
  };
}

function model(spec: DocumentSpecification): DocumentModelGlobalState {
  return {
    id: "example/payment-fixture",
    name: "PaymentFixture",
    description: "",
    extension: ".payment",
    author: { name: "", website: null },
    specifications: [spec],
  };
}

function makeProject(prefix: string) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify({ name: "payment-fixture", type: "module" }),
  );
  writeFileSync(join(dir, "tsconfig.json"), tsConfigTemplate);
  return dir;
}

const require = createRequire(import.meta.url);

function linkDependencies(dir: string, names: string[]) {
  for (const name of names) {
    const target = (require.resolve.paths(name) ?? [])
      .map((nodeModules) => join(nodeModules, name))
      .find((candidate) => existsSync(join(candidate, "package.json")));
    if (!target) throw new Error(`${name} is not installed`);
    const link = join(dir, "node_modules", name);
    mkdirSync(dirname(link), { recursive: true });
    symlinkSync(realpathSync(target), link, "dir");
  }
}

async function generatedTestInput(
  versionDir: string,
  inputSchemas: string[],
): Promise<Record<string, unknown>> {
  const testFile = new Project().addSourceFileAtPath(
    join(versionDir, "tests/payments.test.ts"),
  );
  const scalarsImport = testFile
    .getImportDeclarations()
    .find((i) => i.getModuleSpecifierValue().endsWith("scalars/index.js"));
  const input = testFile
    .getDescendantsOfKind(SyntaxKind.VariableDeclaration)
    .find((declaration) => declaration.getName() === "input")
    ?.getInitializerIfKindOrThrow(SyntaxKind.CallExpression);
  const probe = join(versionDir, "tests/input.probe.ts");
  writeFileSync(
    probe,
    [
      `import { generateMock } from "document-model/mock";`,
      `import { ${[...inputSchemas, "SetPaymentInputSchema"].join(", ")} } from "../gen/schema/zod.js";`,
      scalarsImport?.getText(),
      `export const input = ${input?.getText()};`,
    ].join("\n"),
  );
  const { input: generated } = (await import(probe)) as {
    input: Record<string, unknown>;
  };
  const zod = (await import(join(versionDir, "gen/schema/zod.ts"))) as {
    SetPaymentInputSchema: () => z.ZodType;
  };
  expect(zod.SetPaymentInputSchema().safeParse(generated).error).toBe(
    undefined,
  );
  return generated;
}

const temporary: string[] = [];

afterAll(() => {
  for (const dir of temporary) rmSync(dir, { recursive: true, force: true });
});

describe("a model that declares project scalars", () => {
  const workDir = makeProject("project-scalar-codegen-");
  temporary.push(workDir);
  const versionDir = join(workDir, "document-models", "payment-fixture", "v1");
  const generatedFiles = [
    "gen/schema/types.ts",
    "gen/schema/zod.ts",
    "schema.graphql",
  ];

  beforeAll(async () => {
    mkdirSync(join(workDir, "scalars"));
    writeFileSync(join(workDir, "scalars", "index.ts"), scalarsModule);
    linkDependencies(workDir, [
      "document-model",
      "@powerhousedao/reactor-browser",
      "zod",
      "vitest",
      "@types/node",
    ]);
    const project = buildTsMorphProject(workDir);
    await generateDocumentModel(
      model(
        specification(
          stateSchema,
          operationSchema,
          '{"iban":null,"accounts":[],"bic":null}',
        ),
      ),
      project,
    );
    await project.save();
  }, 60_000);

  it.each(generatedFiles)("generates %s", async (file) => {
    const actual = readFileSync(join(versionDir, file), "utf8");
    const golden = fileURLToPath(
      new URL(
        `./goldens/scalar-codegen/project-scalar/${file.replaceAll("/", "-")}.txt`,
        import.meta.url,
      ),
    );
    await expect(actual).toMatchFileSnapshot(golden);
  });

  it("generates a project that typechecks", () => {
    const tsc = join(
      dirname(require.resolve("typescript/package.json")),
      "bin/tsc",
    );
    const { status, stdout } = spawnSync(
      process.execPath,
      [tsc, "--noEmit", "-p", workDir],
      { cwd: workDir, encoding: "utf8" },
    );
    expect({ status, stdout }).toEqual({ status: 0, stdout: "" });
  }, 60_000);

  it("validates project scalar fields with the definition's schema", async () => {
    const zod = (await import(join(versionDir, "gen/schema/zod.ts"))) as {
      SetPaymentInputSchema: () => z.ZodType;
    };
    const schema = zod.SetPaymentInputSchema();
    expect(
      schema.safeParse({
        iban: "DE89370400440532013000",
        bic: "DEUTDEFF",
        accounts: [],
        beneficiary: { iban: "DE89370400440532013000" },
      }).success,
    ).toBe(true);
    const invalid = schema.safeParse({
      iban: "not an iban",
      bic: "DEUTDEFF",
      accounts: [],
      beneficiary: { iban: "DE89370400440532013000" },
    });
    expect(invalid.success).toBe(false);
    expect(invalid.error?.issues.map((issue) => issue.path)).toEqual([
      ["iban"],
    ]);
  });

  it("generates a test input that the operation's schema accepts", async () => {
    const generated = await generatedTestInput(versionDir, [
      "BankInputSchema",
      "PayeeInputSchema",
    ]);
    const bic: unknown = expect.stringMatching(
      /^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/,
    );
    expect(generated).toMatchObject({
      iban: "DE89370400440532013000",
      payee: "DE89370400440532013000",
      bic,
      accounts: ["DE89370400440532013000"],
      payees: ["DE89370400440532013000"],
      payeeGroups: [[bic]],
      beneficiary: { iban: "DE89370400440532013000", bank: { bic } },
      beneficiaries: [{ iban: "DE89370400440532013000", bank: { bic } }],
    });
  });
});

describe("an operation input that uses an input object declared in the state schema", () => {
  const workDir = makeProject("project-scalar-state-input-");
  temporary.push(workDir);
  const versionDir = join(workDir, "document-models", "payment-fixture", "v1");

  beforeAll(async () => {
    mkdirSync(join(workDir, "scalars"));
    writeFileSync(join(workDir, "scalars", "index.ts"), scalarsModule);
    linkDependencies(workDir, ["document-model", "zod"]);
    const project = buildTsMorphProject(workDir);
    await generateDocumentModel(
      model(
        specification(
          `scalar Iban

input PayeeInput {
  iban: Iban!
}

type PaymentFixtureState {
  iban: Iban
}`,
          "input SetPaymentInput {\n  payee: PayeeInput!\n}",
          '{"iban":null}',
        ),
      ),
      project,
    );
    await project.save();
  }, 60_000);

  it("generates a test input that the operation's schema accepts", async () => {
    expect(await generatedTestInput(versionDir, ["PayeeInputSchema"])).toEqual({
      payee: { iban: "DE89370400440532013000" },
    });
  });
});

describe("an operation whose SDL names its input type in another case, after a nested input", () => {
  const workDir = makeProject("project-scalar-input-case-");
  temporary.push(workDir);
  const versionDir = join(workDir, "document-models", "payment-fixture", "v1");

  beforeAll(async () => {
    mkdirSync(join(workDir, "scalars"));
    writeFileSync(join(workDir, "scalars", "index.ts"), scalarsModule);
    linkDependencies(workDir, ["document-model", "zod"]);
    const project = buildTsMorphProject(workDir);
    await generateDocumentModel(
      model(
        specification(
          `scalar Iban

type PaymentFixtureState {
  iban: Iban
}`,
          `input NoteInput {
  text: String
}

input SetPAYMENTInput {
  iban: Iban!
  note: NoteInput
}`,
          '{"iban":null}',
        ),
      ),
      project,
    );
    await project.save();
  }, 60_000);

  it("generates a test input with the scalar's example", async () => {
    expect(await generatedTestInput(versionDir, [])).toMatchObject({
      iban: "DE89370400440532013000",
    });
  });
});

type PaymentState = PHBaseState & {
  global: { iban: string | null; label: string | null };
};

describe("a model whose project scalar changes the values it accepts", () => {
  const workDir = makeProject("project-scalar-canonical-");
  temporary.push(workDir);
  const versionDir = join(workDir, "document-models", "payment-fixture", "v1");

  beforeAll(async () => {
    mkdirSync(join(workDir, "scalars"));
    writeFileSync(
      join(workDir, "scalars", "index.ts"),
      `import { defineScalar } from "document-model/scalars";
import { z } from "zod";

export const Iban = defineScalar({
  name: "Iban",
  schema: z.string().trim().toUpperCase(),
});
`,
    );
    linkDependencies(workDir, ["document-model", "zod"]);
    const project = buildTsMorphProject(workDir);
    await generateDocumentModel(
      model({
        ...specification(
          "scalar Iban\ntype PaymentFixtureState { iban: Iban label: String }",
          null,
          '{"iban":null,"label":null}',
        ),
        modules: [
          paymentsModule({
            SET_PAYMENT: "input SetPaymentInput { iban: Iban! }",
            SET_PAYEE:
              "input PayeeInput { iban: Iban! }\ninput SetPayeeInput { payee: PayeeInput! }",
            SET_LABEL: 'input SetLabelInput { label: String = "SDL default" }',
            SET_IBAN:
              "input IbanNoteInput { text: String }\ninput SetIBANInput { iban: Iban! note: IbanNoteInput }",
          }),
        ],
      }),
      project,
    );
    await project.save();
    writeFileSync(
      join(versionDir, "src/reducers/payments.ts"),
      `export const paymentFixturePaymentsOperations = {
  setPaymentOperation(
    state: { iban: string | null },
    action: { input: { iban: string } },
  ) {
    state.iban = action.input.iban;
  },
  setPayeeOperation(
    state: { iban: string | null },
    action: { input: { payee: { iban: string } } },
  ) {
    state.iban = action.input.payee.iban;
  },
  setLabelOperation(
    state: { label: string | null },
    action: { input: { label?: string | null } },
  ) {
    state.label = action.input.label ?? "reducer fallback";
  },
  setIbanOperation(
    state: { iban: string | null },
    action: { input: { iban: string } },
  ) {
    state.iban = action.input.iban;
  },
};
`,
    );
  }, 60_000);

  async function generated() {
    const creators = (await import(
      join(versionDir, "gen/payments/creators.ts")
    )) as {
      setPayment: (input: { iban: string }) => Action;
      setPayee: (input: { payee: { iban: string } }) => Action;
      setLabel: (input: { label?: string }) => Action;
      setIban: (input: { iban: string }) => Action;
    };
    const { reducer } = (await import(join(versionDir, "gen/reducer.ts"))) as {
      reducer: Reducer<PaymentState>;
    };
    const document = baseCreateDocument<PaymentState>(() => ({
      ...defaultBaseState(),
      global: { iban: null, label: null },
      local: {},
    }));
    return { ...creators, reducer, document };
  }

  it("hands the operation the parsed input and stores the input as sent", async () => {
    const { setPayment, reducer, document } = await generated();

    const result = reducer(document, setPayment({ iban: " de89 " }));

    expect(result.state.global).toEqual({ iban: "DE89", label: null });
    expect(result.operations.global.map((op) => op.action.input)).toEqual([
      { iban: " de89 " },
    ]);
  });

  it("hands the parsed input to an operation whose nested input reaches the scalar", async () => {
    const { setPayee, reducer, document } = await generated();

    const result = reducer(document, setPayee({ payee: { iban: " de89 " } }));

    expect(result.state.global).toEqual({ iban: "DE89", label: null });
    expect(result.operations.global.map((op) => op.action.input)).toEqual([
      { payee: { iban: " de89 " } },
    ]);
  });

  it("hands the parsed input to an operation whose SDL names its input type in another case, after a nested input", async () => {
    const { setIban, reducer, document } = await generated();

    const result = reducer(document, setIban({ iban: " de89 " }));

    expect(result.state.global).toEqual({ iban: "DE89", label: null });
  });

  it("hands an operation whose input reaches no project scalar the action as sent", async () => {
    const { setLabel, reducer, document } = await generated();

    const result = reducer(document, setLabel({}));

    expect(result.state.global).toEqual({
      iban: null,
      label: "reducer fallback",
    });
  });
});

describe("a model whose project scalars have no scalars module", () => {
  it("is refused before codegen writes any file", async () => {
    const workDir = makeProject("project-scalar-missing-");
    temporary.push(workDir);
    const project = buildTsMorphProject(workDir);

    await expect(
      generateDocumentModel(
        model(specification(stateSchema, operationSchema)),
        project,
      ),
    ).rejects.toThrow(
      new Error(
        "Model PaymentFixture declares scalars Bic, Iban, which are not built-in scalars. Create scalars/index.ts and export them from there with defineScalar.",
      ),
    );
    expect(existsSync(join(workDir, "document-models"))).toBe(false);
  });

  it("names a single scalar", async () => {
    const workDir = makeProject("project-scalar-missing-one-");
    temporary.push(workDir);
    const project = buildTsMorphProject(workDir);

    await expect(
      generateDocumentModel(
        model(
          specification(
            "scalar Iban\ntype PaymentFixtureState { iban: Iban }",
            null,
          ),
        ),
        project,
      ),
    ).rejects.toThrow(
      new Error(
        "Model PaymentFixture declares scalar Iban, which is not a built-in scalar. Create scalars/index.ts and export it from there with defineScalar.",
      ),
    );
  });
});

describe("a model that redeclares a GraphQL built-in scalar", () => {
  const files = [
    "gen/schema/types.ts",
    "gen/schema/zod.ts",
    "tests/payments.test.ts",
  ];

  async function generate(prefix: string, state: string) {
    const workDir = makeProject(prefix);
    temporary.push(workDir);
    const project = buildTsMorphProject(workDir);
    await generateDocumentModel(
      model(
        specification(
          state,
          "input SetPaymentInput { count: Int! }",
          '{"count":0}',
        ),
      ),
      project,
    );
    await project.save();
    const versionDir = join(workDir, "document-models", "payment-fixture");
    return files.map((file) =>
      readFileSync(join(versionDir, "v1", file), "utf8"),
    );
  }

  it("generates the same code as a model that does not declare it", async () => {
    const state = "type PaymentFixtureState { count: Int! }";
    const redeclared = await generate(
      "project-scalar-builtin-",
      `scalar Int\n${state}`,
    );
    const plain = await generate("project-scalar-plain-", state);

    expect(redeclared).toEqual(plain);
    expect(redeclared.join("\n")).not.toContain("scalars/index");
  }, 60_000);
});

describe("an upgrade that adds a required project scalar field", () => {
  it("names the scalar in the manual migration reason", () => {
    expect(
      buildMigrationPlan({
        previousSpec: specification(
          "type PaymentFixtureState { stable: String }",
          null,
        ),
        specification: specification(
          "scalar Iban\ntype PaymentFixtureState { stable: String iban: Iban! }",
          null,
        ),
        stateName: "PaymentFixtureState",
        localStateName: "PaymentFixtureLocalState",
      }),
    ).toEqual({
      kind: "manual",
      reason:
        'no initial value could be derived for the added global state field "iban", whose type uses the project scalar Iban',
    });
  });
});

describe("an upgrade that adds a catalog scalar field", () => {
  function plan(field: string, initialValue = "{}") {
    return buildMigrationPlan({
      previousSpec: specification(
        "type PaymentFixtureState { stable: String }",
        null,
      ),
      specification: specification(
        `scalar DateTime\ntype PaymentFixtureState { stable: String value: ${field} }`,
        null,
        initialValue,
      ),
      stateName: "PaymentFixtureState",
      localStateName: "PaymentFixtureLocalState",
    });
  }

  it("leaves a required field to a manual migration without naming a project scalar", () => {
    expect(plan("DateTime!")).toEqual({
      kind: "manual",
      reason:
        'no initial value could be derived for the added global state field "value"',
    });
  });

  it("fills an optional field, a required list and a field the author initialized", () => {
    expect(plan("DateTime")).toEqual({
      kind: "fill",
      fills: { global: { value: null } },
    });
    expect(plan("[DateTime!]!")).toEqual({
      kind: "fill",
      fills: { global: { value: [] } },
    });
    expect(plan("DateTime!", '{"value":"2024-01-01T00:00:00.000Z"}')).toEqual({
      kind: "fill",
      fills: { global: { value: "2024-01-01T00:00:00.000Z" } },
    });
  });
});

describe("an operation input whose nested input names, duplicate declarations and extensions the generated schema rewrites", () => {
  const workDir = makeProject("project-scalar-naming-");
  temporary.push(workDir);
  const versionDir = join(workDir, "document-models", "payment-fixture", "v1");

  beforeAll(async () => {
    mkdirSync(join(workDir, "scalars"));
    writeFileSync(
      join(workDir, "scalars", "index.ts"),
      `import { defineScalar } from "document-model/scalars";
import { z } from "zod";

export const Iban = defineScalar({
  name: "Iban",
  schema: z.string().regex(/^[A-Z]{2}\\d{2}[A-Z0-9]{11,30}$/),
  example: "DE89370400440532013000",
});

export const Wallet = defineScalar({
  name: "Wallet",
  schema: z.custom<\`0x\${string}\`>(
    (value) => typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value),
  ),
  example: "0x1111111111111111111111111111111111111111",
});
`,
    );
    linkDependencies(workDir, [
      "document-model",
      "@powerhousedao/reactor-browser",
      "zod",
      "vitest",
      "@types/node",
    ]);
    const project = buildTsMorphProject(workDir);
    await generateDocumentModel(
      model(
        specification(
          "scalar Iban\nscalar Wallet\ninput IBANDetails { iban: Iban! }\ntype PaymentFixtureState { iban: Iban, count: Int! }",
          `input bank_details { iban: Iban! }
input IBANDetails { note: String }
input SetPaymentInput { snake: bank_details!, acronym: IBANDetails!, note: String }
extend input SetPaymentInput { wallet: Wallet! }`,
          '{"iban":null,"count":0}',
        ),
      ),
      project,
    );
    await project.save();
  }, 60_000);

  it("generates a project that typechecks", () => {
    const tsc = join(
      dirname(require.resolve("typescript/package.json")),
      "bin/tsc",
    );
    const { status, stdout } = spawnSync(
      process.execPath,
      [tsc, "--noEmit", "-p", workDir],
      { cwd: workDir, encoding: "utf8" },
    );
    expect({ status, stdout }).toEqual({ status: 0, stdout: "" });
  }, 60_000);

  it("generates a test input that the operation's schema accepts", async () => {
    expect(
      await generatedTestInput(versionDir, [
        "Bank_DetailsSchema",
        "IbanDetailsSchema",
      ]),
    ).toMatchObject({
      snake: { iban: "DE89370400440532013000" },
      acronym: { iban: "DE89370400440532013000" },
      wallet: "0x1111111111111111111111111111111111111111",
    });
  });
});
