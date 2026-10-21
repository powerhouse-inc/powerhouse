import type {
  DefinitionCheckReport,
  DefinitionDiagnostic,
  DefinitionSource,
} from "@powerhousedao/shared/document-model";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { adaptCodeFirstDocumentModelSource } from "../../src/definition/adapters/code-first-document-model-source-adapter.js";
import type { NormalizedDocumentModelArtifact } from "../../src/definition/adapters/types.js";
import { ph } from "../../src/definition/field.js";
import { defineDocumentModel } from "../../src/definition/model.js";
import { defineScalar } from "../../src/definition/scalars/define-scalar.js";
import { checkDefinitions } from "../../src/definition/tooling/check-definitions.js";
import { DefinitionSourceLoader } from "../../src/definition/tooling/definition-source-loader.js";
import { schemaFirstGraphQLDocument } from "../../src/definition/tooling/graphql-document.js";
import { checkInterfaceImplementations } from "../../src/definition/tooling/interface-implementations.js";
import type {
  AnyTypeDescriptor,
  ObjectFields,
} from "../../src/definition/types.js";
import {
  materializeFixturePackage,
  packageRevisionOf,
} from "./loader-contract.js";

const SOURCE = {
  specifier: "./models/probe.ts",
  exportPath: ["Probe"],
} satisfies DefinitionSource;
const OWNER_PATH = ["specifications", 0, "types", 1];
// finalize() reports a type where the walk first reaches it.
const DECLARATION_PATH = [
  "specifications",
  "global",
  "schema",
  "fields",
  "item",
];

function artifactOf(model: unknown): NormalizedDocumentModelArtifact {
  const result = adaptCodeFirstDocumentModelSource(model, SOURCE);
  const artifact = result.artifacts.at(0);
  if (result.diagnostics.length > 0 || artifact === undefined) {
    throw new Error(JSON.stringify(result.diagnostics));
  }
  return artifact;
}

function finalizeProbe(
  implementation: AnyTypeDescriptor,
  specifications: {
    readonly sdl?: readonly string[];
    readonly auxiliaryTypes?: readonly AnyTypeDescriptor[];
  } = {},
) {
  return defineDocumentModel({
    id: "test/probe",
    name: "Probe",
    description: "",
    extension: "probe",
    version: 1,
    author: { name: "Powerhouse" },
    specifications: {
      ...(specifications.sdl !== undefined && {
        graphQLCompatibility: schemaFirstGraphQLDocument(specifications.sdl),
      }),
      ...(specifications.auxiliaryTypes !== undefined && {
        auxiliaryTypes: specifications.auxiliaryTypes,
      }),
      global: {
        schema: ph.object("ProbeState", {
          fields: { item: ph.ref(implementation) },
        }),
        initialValue: { item: null },
      },
      local: { schema: null, initialValue: {} },
    },
  }).finalize({ modules: [] });
}

type ProbeOptions = {
  readonly interfaceFields: ObjectFields;
  readonly implementationFields: ObjectFields;
  readonly sdl?: readonly string[];
  readonly auxiliaryTypes?: readonly AnyTypeDescriptor[];
};

function finalizeContractProbe(options: ProbeOptions) {
  const Contract = ph.interface("Contract", {
    fields: options.interfaceFields,
  });
  const Implementation = ph.object("Implementation", {
    implements: [Contract],
    fields: options.implementationFields,
  });
  return finalizeProbe(Implementation, options);
}

function probe(options: ProbeOptions): NormalizedDocumentModelArtifact {
  return artifactOf(finalizeContractProbe(options));
}

function ancestorProbe(
  interfaceOwner: boolean,
  implemented: "Child" | "Child & Named",
) {
  const Named = ph.interface("Named", { fields: { label: ph.String() } });
  const Child = ph.interface("Child", {
    implements: [Named],
    fields: { label: ph.String() },
  });
  const options = {
    implements: implemented === "Child" ? [Child] : [Child, Named],
    fields: { label: ph.String() },
  };
  return finalizeProbe(
    interfaceOwner
      ? ph.interface("Implementation", options)
      : ph.object("Implementation", options),
  );
}

function summary(diagnostics: readonly DefinitionDiagnostic[]) {
  return diagnostics.map(({ code, path, message }) => ({
    code,
    path,
    message,
  }));
}

function argumentProbe(contractArguments: string, arguments_: string) {
  return probe({
    interfaceFields: { f: ph.String() },
    implementationFields: { f: ph.String() },
    sdl: [
      "type ProbeState { item: Implementation }",
      `interface Contract { f${contractArguments}: String }`,
      `type Implementation implements Contract { f${arguments_}: String }`,
    ],
  });
}
describe("a declaration that breaks an implementation rule", () => {
  let fixture: ReturnType<typeof materializeFixturePackage>;
  beforeAll(() => {
    fixture = materializeFixturePackage("interfaces");
  });
  afterAll(() => fixture.dispose());

  /** `ph model check` on a package whose one source exports `build()`. */
  async function check(build: () => unknown): Promise<DefinitionCheckReport> {
    const loader = new DefinitionSourceLoader({
      // Evaluating a source module is what runs its finalize().
      importModule: () => Promise.resolve().then(() => ({ Probe: build() })),
    });
    try {
      return await checkDefinitions({
        profile: "edit",
        loader,
        packageRevision: packageRevisionOf(fixture.root),
        configFile: join(fixture.root, "powerhouse.config.json"),
      });
    } finally {
      await loader.dispose();
    }
  }

  async function refusal(build: () => unknown) {
    const report = await check(build);
    expect(report.status).toBe("invalid");
    return summary(report.diagnostics);
  }

  async function expectAccepted(build: () => unknown): Promise<void> {
    const report = await check(build);
    expect(report.status).toBe("ok");
    expect(report.diagnostics).toStrictEqual([]);
    expect(report.definitions.map(({ key }) => key)).toStrictEqual([
      "test/probe",
    ]);
  }

  it.each([false, true])(
    "is refused by finalize() for a missing field even when required is %s",
    async (required) => {
      const report = await check(() =>
        finalizeContractProbe({
          interfaceFields: { label: ph.String({ required }) },
          implementationFields: { other: ph.String() },
        }),
      );
      expect(report.status).toBe("invalid");
      expect(report.diagnostics).toStrictEqual([
        {
          code: "PH-DM-INTERFACE-INVALID",
          severity: "error",
          phase: "definition",
          source: { specifier: "./src/missing-interface-field.ts" },
          definition: { kind: "document-model", key: "test/probe", version: 1 },
          path: DECLARATION_PATH,
          message:
            "Interface field Contract.label expected but Implementation does not provide it.",
          expected: `Contract.label: String${required ? "!" : ""}`,
          received: "missing field",
          repair:
            "Add label with a type compatible with Contract.label, or remove Contract from Implementation's implemented interfaces.",
        },
      ]);
    },
  );

  it.each([
    {
      expected: ph.String(),
      actual: ph.Int(),
      expectedType: "String",
      actualType: "Int",
    },
    {
      expected: ph.String({ required: true }),
      actual: ph.String(),
      expectedType: "String!",
      actualType: "String",
    },
    {
      expected: ph.list(ph.String({ required: true })),
      actual: ph.list(ph.String()),
      expectedType: "[String!]",
      actualType: "[String]",
    },
    {
      expected: ph.list(ph.String(), { required: true }),
      actual: ph.list(ph.String()),
      expectedType: "[String]!",
      actualType: "[String]",
    },
    {
      expected: ph.list(ph.list(ph.String({ required: true }))),
      actual: ph.list(ph.list(ph.String())),
      expectedType: "[[String!]]",
      actualType: "[[String]]",
    },
    {
      expected: ph.list(ph.String()),
      actual: ph.String(),
      expectedType: "[String]",
      actualType: "String",
    },
    {
      expected: ph.String(),
      actual: ph.list(ph.String()),
      expectedType: "String",
      actualType: "[String]",
    },
  ])(
    "is refused by finalize() for return type $actualType for $expectedType",
    async ({ expected, actual, expectedType, actualType }) => {
      expect(
        await refusal(() =>
          finalizeContractProbe({
            interfaceFields: { f: expected },
            implementationFields: { f: actual },
          }),
        ),
      ).toStrictEqual([
        {
          code: "PH-DM-INTERFACE-INVALID",
          path: DECLARATION_PATH,
          message: `Interface field Contract.f expects type ${expectedType} but Implementation.f is type ${actualType}.`,
        },
      ]);
    },
  );

  it.each([
    { expected: ph.String(), actual: ph.String() },
    { expected: ph.String(), actual: ph.String({ required: true }) },
    {
      expected: ph.list(ph.String()),
      actual: ph.list(ph.String({ required: true }), { required: true }),
    },
    {
      expected: ph.list(ph.list(ph.String())),
      actual: ph.list(
        ph.list(ph.String({ required: true }), { required: true }),
        { required: true },
      ),
    },
  ])(
    "accepts equal and covariant return wrappers %#",
    async ({ expected, actual }) => {
      await expectAccepted(() =>
        finalizeContractProbe({
          interfaceFields: { f: expected },
          implementationFields: { f: actual },
        }),
      );
    },
  );

  it("accepts object, interface and union return covariance", async () => {
    const Named = ph.interface("Named", { fields: { label: ph.String() } });
    const Child = ph.interface("Child", {
      implements: [Named],
      fields: { label: ph.String() },
    });
    const Person = ph.object("Person", {
      implements: [Named],
      fields: { label: ph.String() },
    });
    const Result = ph.union("Result", { members: [Person] });
    await expectAccepted(() =>
      finalizeContractProbe({
        interfaceFields: {
          object: ph.ref(Named),
          child: ph.ref(Named),
          union: ph.ref(Result),
        },
        implementationFields: {
          object: ph.ref(Person),
          child: ph.ref(Child),
          union: ph.ref(Person),
        },
      }),
    );
  });

  it("is refused by finalize() for an object outside the interface or union it must narrow", async () => {
    const Named = ph.interface("Named", { fields: { label: ph.String() } });
    const Person = ph.object("Person", { fields: { label: ph.String() } });
    const Other = ph.object("Other", { fields: { label: ph.String() } });
    const Result = ph.union("Result", { members: [Other] });
    expect(
      await refusal(() =>
        finalizeContractProbe({
          interfaceFields: { object: ph.ref(Named), union: ph.ref(Result) },
          implementationFields: {
            object: ph.ref(Person),
            union: ph.ref(Person),
          },
        }),
      ),
    ).toStrictEqual([
      {
        code: "PH-DM-INTERFACE-INVALID",
        path: DECLARATION_PATH,
        message:
          "Interface field Contract.object expects type Named but Implementation.object is type Person.",
      },
      {
        code: "PH-DM-INTERFACE-INVALID",
        path: DECLARATION_PATH,
        message:
          "Interface field Contract.union expects type Result but Implementation.union is type Person.",
      },
    ]);
  });

  it.each([false, true])(
    "is refused by finalize() without explicit ancestor interfaces on an %s interface owner",
    async (interfaceOwner) => {
      expect(
        await refusal(() => ancestorProbe(interfaceOwner, "Child")),
      ).toStrictEqual([
        {
          code: "PH-DM-INTERFACE-INVALID",
          path: DECLARATION_PATH,
          message:
            "Type Implementation must implement Named because it is implemented by Child.",
        },
      ]);
    },
  );

  it.each([false, true])(
    "accepts explicit ancestor interfaces on an %s interface owner",
    async (interfaceOwner) => {
      await expectAccepted(() =>
        ancestorProbe(interfaceOwner, "Child & Named"),
      );
    },
  );
});

describe("a retained schema-first document", () => {
  it("checks compatibility-only root implementations at their own AST path", () => {
    const artifact = probe({
      interfaceFields: { f: ph.String() },
      implementationFields: { f: ph.String() },
      sdl: [
        "type ProbeState { item: Implementation }",
        "interface Contract { f: String }",
        "type Implementation implements Contract { f: String }",
        "type Query implements Contract { other: String }",
      ],
    });
    expect(summary(checkInterfaceImplementations(artifact))).toStrictEqual([
      {
        code: "PH-DM-INTERFACE-INVALID",
        path: [
          "specifications",
          0,
          "graphQLCompatibility",
          "document",
          "definitions",
          3,
        ],
        message:
          "Interface field Contract.f expected but Query does not provide it.",
      },
    ]);
  });

  it.each(["DateTime", "Amount_Money"])(
    "accepts host scalar %s used only in compatibility arguments",
    (name) => {
      const artifact = argumentProbe(`(term: ${name})`, `(term: ${name})`);
      expect(artifact.definition.specifications[0].scalars).toStrictEqual([]);
      expect(checkInterfaceImplementations(artifact)).toStrictEqual([]);
    },
  );

  it.each(["String", "String!"])(
    "requires the interface argument %s even when optional",
    (type) => {
      expect(
        summary(
          checkInterfaceImplementations(argumentProbe(`(term: ${type})`, "")),
        ),
      ).toStrictEqual([
        {
          code: "PH-DM-INTERFACE-INVALID",
          path: OWNER_PATH,
          message:
            "Interface field argument Contract.f(term:) expected but Implementation.f does not provide it.",
        },
      ]);
    },
  );

  it.each([
    ["String", "String!"],
    ["String!", "String"],
    ["String", "Int"],
    ["[String!]", "[String]"],
    ["[String]", "[String]!"],
  ])(
    "requires invariant argument type %s instead of %s",
    (expected, actual) => {
      expect(
        summary(
          checkInterfaceImplementations(
            argumentProbe(`(term: ${expected})`, `(term: ${actual})`),
          ),
        ),
      ).toStrictEqual([
        {
          code: "PH-DM-INTERFACE-INVALID",
          path: OWNER_PATH,
          message: `Interface field argument Contract.f(term:) expects type ${expected} but Implementation.f(term:) is type ${actual}.`,
        },
      ]);
    },
  );

  it("does not confuse an argument with a differently named argument", () => {
    expect(
      summary(
        checkInterfaceImplementations(
          argumentProbe("(term: String)", "(query: String)"),
        ),
      ),
    ).toStrictEqual([
      {
        code: "PH-DM-INTERFACE-INVALID",
        path: OWNER_PATH,
        message:
          "Interface field argument Contract.f(term:) expected but Implementation.f does not provide it.",
      },
    ]);
  });

  it.each(["(limit: Int!)", "(limit: Int! = null)"])(
    "rejects the extra required argument %s",
    (arguments_) => {
      expect(
        summary(checkInterfaceImplementations(argumentProbe("", arguments_))),
      ).toStrictEqual([
        {
          code: "PH-DM-INTERFACE-INVALID",
          path: OWNER_PATH,
          message:
            "Object field Implementation.f includes required argument limit that is missing from the Interface field Contract.f.",
        },
      ]);
    },
  );

  it.each([
    ["", "(limit: Int)"],
    ["", "(limit: Int! = 1)"],
    ['(term: String = "one")', '(term: String = "two")'],
    ["(term: [String!])", "(term: [String!], limit: Int! = 1)"],
  ])(
    "accepts optional arguments and independent defaults %#",
    (contract, implementation) => {
      const artifact = argumentProbe(contract, implementation);
      expect(checkInterfaceImplementations(artifact)).toStrictEqual([]);
      expect(
        artifact.definition.specifications[0].graphQLCompatibility?.kind,
      ).toBe("graphql-ast-v1");
    },
  );

  it.each([
    {
      label: "self",
      contract: "interface Contract implements Contract { f: String }",
      owner: "type Implementation implements Contract { f: String }",
      messages: [
        "Type Contract cannot implement itself because it would create a circular reference.",
      ],
    },
    {
      label: "cycle",
      contract: "interface Contract implements Implementation { f: String }",
      owner: "interface Implementation implements Contract { f: String }",
      messages: [
        "Type Implementation cannot implement Contract because it would create a circular reference.",
        "Type Contract cannot implement Implementation because it would create a circular reference.",
      ],
    },
    {
      label: "duplicate",
      contract: "interface Contract { f: String }",
      owner: "type Implementation implements Contract & Contract { f: String }",
      messages: ["Type Implementation can only implement Contract once."],
    },
    {
      label: "non-interface",
      contract: "type Contract { f: String }",
      owner: "type Implementation implements Contract { f: String }",
      messages: [
        "Type Implementation must only implement Interface types, it cannot implement Contract.",
      ],
    },
  ])(
    "reports the $label AST rule on each actual owner",
    ({ label, contract, owner, messages }) => {
      const seed = probe({
        interfaceFields: { f: ph.String() },
        implementationFields: { f: ph.String() },
      });
      const specification = seed.definition.specifications[0];
      const artifact = {
        ...seed,
        definition: {
          ...seed.definition,
          specifications: [
            {
              ...specification,
              graphQLCompatibility: schemaFirstGraphQLDocument([
                "type ProbeState { item: Implementation }",
                contract,
                owner,
              ]),
              types: specification.types.map((type) =>
                type.name === "Contract" &&
                type.kind === "interface" &&
                (label === "self" || label === "cycle")
                  ? {
                      ...type,
                      implements: [
                        label === "self" ? "Contract" : "Implementation",
                      ],
                    }
                  : type,
              ),
            },
          ],
        },
      };
      expect(summary(checkInterfaceImplementations(artifact))).toStrictEqual(
        messages.map((message, index) => ({
          code: "PH-DM-INTERFACE-INVALID",
          path: [
            "specifications",
            0,
            "types",
            label === "self" || index === 1 ? 2 : 1,
          ],
          message,
        })),
      );
    },
  );

  it("checks fields and implements contributed by compatibility extensions", () => {
    const artifact = probe({
      interfaceFields: { f: ph.String(), label: ph.String() },
      implementationFields: { f: ph.String(), label: ph.String() },
      sdl: [
        "type ProbeState { item: Implementation }",
        "interface Contract { f: String }",
        "extend interface Contract { label: String }",
        "type Implementation implements Contract { f: String, label: String }",
        "type Query { f: String }",
        "extend type Query implements Contract",
      ],
    });
    expect(summary(checkInterfaceImplementations(artifact))).toStrictEqual([
      {
        code: "PH-DM-INTERFACE-INVALID",
        path: [
          "specifications",
          0,
          "graphQLCompatibility",
          "document",
          "definitions",
          4,
        ],
        message:
          "Interface field Contract.label expected but Query does not provide it.",
      },
    ]);
  });

  it("composes extension-only implementations and accepts extension-provided arguments", () => {
    const artifact = probe({
      interfaceFields: { f: ph.String() },
      implementationFields: { f: ph.String() },
      sdl: [
        "type ProbeState { item: Implementation }",
        "extend interface Contract { f(term: String): String }",
        "extend type Implementation implements Contract { f(term: String, limit: Int! = 1): String }",
      ],
    });
    expect(checkInterfaceImplementations(artifact)).toStrictEqual([]);
    expect(
      artifact.definition.specifications[0].graphQLCompatibility?.document.definitions.map(
        ({ kind }) => kind,
      ),
    ).toStrictEqual([
      "ObjectTypeDefinition",
      "InterfaceTypeExtension",
      "ObjectTypeExtension",
    ]);
  });

  it("accepts catalog and package scalars without inventing definitions for unknown names", () => {
    const Phone = defineScalar({
      name: "Phone",
      description: "Phone number",
      representation: "string",
      validator: z.string(),
      zodSource: "z.string()",
    });
    const artifact = probe({
      interfaceFields: { phone: Phone(), amount: ph.Money() },
      implementationFields: {
        phone: Phone({ required: true }),
        amount: ph.Money({ required: true }),
      },
      sdl: [
        "type ProbeState { item: Implementation }",
        "interface Contract { phone: Phone, amount: Amount_Money }",
        "type Implementation implements Contract { phone: Phone!, amount: Amount_Money! }",
      ],
    });
    expect(checkInterfaceImplementations(artifact)).toStrictEqual([]);
    expect(
      artifact.definition.specifications[0].scalars.map(({ name }) => name),
    ).toStrictEqual(["Amount_Money", "Phone"]);
  });

  it("preserves explicit scalar definitions", () => {
    const artifact = probe({
      interfaceFields: { f: ph.Money() },
      implementationFields: { f: ph.Money() },
      sdl: [
        "scalar Amount_Money",
        "interface Contract { f: Amount_Money }",
        "type Implementation implements Contract { f: Amount_Money }",
        "type ProbeState { item: Implementation }",
      ],
    });
    expect(checkInterfaceImplementations(artifact)).toStrictEqual([]);
    expect(
      artifact.definition.specifications[0].scalars.map(({ name }) => name),
    ).toStrictEqual(["Amount_Money"]);
  });

  it("does not require a Query root", () => {
    const artifact = argumentProbe("", "");
    expect(checkInterfaceImplementations(artifact)).toStrictEqual([]);
    expect(
      artifact.definition.specifications[0].graphQLCompatibility?.document.definitions.map(
        (definition) => ("name" in definition ? definition.name.value : null),
      ),
    ).toStrictEqual(["ProbeState", "Contract", "Implementation"]);
  });

  it("reports construction failures and continues with the next specification version", () => {
    const seed = probe({
      interfaceFields: { f: ph.String() },
      implementationFields: { f: ph.String() },
    });
    const [specification] = seed.definition.specifications;
    const retaining = (sdl: readonly string[], version: number) => ({
      ...specification,
      version,
      graphQLCompatibility: schemaFirstGraphQLDocument([
        "type ProbeState { item: Implementation }",
        "interface Contract { f: String }",
        ...sdl,
      ]),
    });
    const artifact = {
      ...seed,
      definition: {
        ...seed.definition,
        specifications: [
          retaining(
            ["type Implementation implements Contract { f: Undeclared }"],
            1,
          ),
          retaining(
            [
              "type Implementation implements Contract { f: String }",
              "type Query implements Contract { other: String }",
            ],
            2,
          ),
        ],
      },
    };
    expect(
      checkInterfaceImplementations(artifact).map(
        ({ code, path, message, definition }) => ({
          code,
          path,
          message,
          definition,
        }),
      ),
    ).toStrictEqual([
      {
        code: "PH-DM-INTERFACE-INVALID",
        path: ["specifications", 0],
        message:
          'Cannot check interface implementations: Unknown type: "Undeclared".',
        definition: { kind: "document-model", key: "test/probe", version: 1 },
      },
      {
        code: "PH-DM-INTERFACE-INVALID",
        path: [
          "specifications",
          1,
          "graphQLCompatibility",
          "document",
          "definitions",
          3,
        ],
        message:
          "Interface field Contract.f expected but Query does not provide it.",
        definition: { kind: "document-model", key: "test/probe", version: 2 },
      },
    ]);
  });
});
