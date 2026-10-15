import type {
  DefinitionDiagnostic,
  DefinitionSource,
} from "@powerhousedao/shared/document-model";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { adaptCodeFirstDocumentModelSource } from "../../src/definition/adapters/code-first-document-model-source-adapter.js";
import type { NormalizedDocumentModelArtifact } from "../../src/definition/adapters/types.js";
import { ph } from "../../src/definition/field.js";
import { defineDocumentModel } from "../../src/definition/model.js";
import { defineScalar } from "../../src/definition/scalars/define-scalar.js";
import { schemaFirstGraphQLDocument } from "../../src/definition/tooling/graphql-document.js";
import { checkInterfaceImplementations } from "../../src/definition/tooling/interface-implementations.js";
import type {
  AnyTypeDescriptor,
  ObjectFields,
} from "../../src/definition/types.js";

const SOURCE = {
  specifier: "./models/probe.ts",
  exportPath: ["Probe"],
} satisfies DefinitionSource;
const OWNER_PATH = ["specifications", 0, "types", 1];

function artifactOf(model: unknown): NormalizedDocumentModelArtifact {
  const result = adaptCodeFirstDocumentModelSource(model, SOURCE);
  const artifact = result.artifacts.at(0);
  if (result.diagnostics.length > 0 || artifact === undefined) {
    throw new Error(JSON.stringify(result.diagnostics));
  }
  return artifact;
}

function probe(options: {
  readonly interfaceFields: ObjectFields;
  readonly implementationFields: ObjectFields;
  readonly sdl?: readonly string[];
  readonly auxiliaryTypes?: readonly AnyTypeDescriptor[];
}): NormalizedDocumentModelArtifact {
  const Contract = ph.interface("Contract", {
    fields: options.interfaceFields,
  });
  const Implementation = ph.object("Implementation", {
    implements: [Contract],
    fields: options.implementationFields,
  });
  return artifactOf(
    defineDocumentModel({
      id: "test/probe",
      name: "Probe",
      description: "",
      extension: "probe",
      version: 1,
      author: { name: "Powerhouse" },
      specifications: {
        ...(options.sdl !== undefined && {
          graphQLCompatibility: schemaFirstGraphQLDocument(options.sdl),
        }),
        ...(options.auxiliaryTypes !== undefined && {
          auxiliaryTypes: options.auxiliaryTypes,
        }),
        global: {
          schema: ph.object("ProbeState", {
            fields: { item: ph.ref(Implementation) },
          }),
          initialValue: { item: null },
        },
        local: { schema: null, initialValue: {} },
      },
    }).finalize({ modules: [] }),
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

describe("interface implementations", () => {
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

  it.each([false, true])(
    "reports a missing field even when required is %s, at its implementing object's own index",
    (required) => {
      const artifact = probe({
        interfaceFields: { label: ph.String({ required }) },
        implementationFields: { other: ph.String() },
      });
      expect(checkInterfaceImplementations(artifact)).toStrictEqual([
        {
          code: "PH-DM-INTERFACE-INVALID",
          severity: "error",
          phase: "definition",
          source: SOURCE,
          definition: { kind: "document-model", key: "test/probe", version: 1 },
          path: OWNER_PATH,
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
    "rejects return type $actualType for $expectedType",
    ({ expected, actual, expectedType, actualType }) => {
      expect(
        summary(
          checkInterfaceImplementations(
            probe({
              interfaceFields: { f: expected },
              implementationFields: { f: actual },
            }),
          ),
        ),
      ).toStrictEqual([
        {
          code: "PH-DM-INTERFACE-INVALID",
          path: OWNER_PATH,
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
    ({ expected, actual }) => {
      const artifact = probe({
        interfaceFields: { f: expected },
        implementationFields: { f: actual },
      });
      expect(checkInterfaceImplementations(artifact)).toStrictEqual([]);
      expect(artifact.definition.specifications[0].types[1].name).toBe(
        "Implementation",
      );
    },
  );

  it("accepts object, interface and union return covariance", () => {
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
    const artifact = probe({
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
    });
    expect(checkInterfaceImplementations(artifact)).toStrictEqual([]);
    expect(
      artifact.definition.specifications[0].types.map(({ name }) => name),
    ).toContain("Child");
  });

  it("rejects an object outside the interface or union it must narrow", () => {
    const Named = ph.interface("Named", { fields: { label: ph.String() } });
    const Person = ph.object("Person", { fields: { label: ph.String() } });
    const Other = ph.object("Other", { fields: { label: ph.String() } });
    const Result = ph.union("Result", { members: [Other] });
    const artifact = probe({
      interfaceFields: { object: ph.ref(Named), union: ph.ref(Result) },
      implementationFields: { object: ph.ref(Person), union: ph.ref(Person) },
    });
    expect(summary(checkInterfaceImplementations(artifact))).toStrictEqual([
      {
        code: "PH-DM-INTERFACE-INVALID",
        path: OWNER_PATH,
        message:
          "Interface field Contract.object expects type Named but Implementation.object is type Person.",
      },
      {
        code: "PH-DM-INTERFACE-INVALID",
        path: OWNER_PATH,
        message:
          "Interface field Contract.union expects type Result but Implementation.union is type Person.",
      },
    ]);
  });

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

  it.each([false, true])(
    "requires explicit ancestor interfaces on an %s interface owner",
    (interfaceOwner) => {
      const Named = ph.interface("Named", { fields: { label: ph.String() } });
      const Child = ph.interface("Child", {
        implements: [Named],
        fields: { label: ph.String() },
      });
      const Implementation = interfaceOwner
        ? ph.interface("Implementation", {
            implements: [Child],
            fields: { label: ph.String() },
          })
        : ph.object("Implementation", {
            implements: [Child],
            fields: { label: ph.String() },
          });
      const model = defineDocumentModel({
        id: "test/probe",
        name: "Probe",
        description: "",
        extension: "probe",
        version: 1,
        author: { name: "Powerhouse" },
        specifications: {
          global: {
            schema: ph.object("ProbeState", {
              fields: { item: ph.ref(Implementation) },
            }),
            initialValue: { item: null },
          },
          local: { schema: null, initialValue: {} },
        },
      }).finalize({ modules: [] });
      expect(
        summary(checkInterfaceImplementations(artifactOf(model))),
      ).toStrictEqual([
        {
          code: "PH-DM-INTERFACE-INVALID",
          path: OWNER_PATH,
          message:
            "Type Implementation must implement Named because it is implemented by Child.",
        },
      ]);
    },
  );

  it.each([false, true])(
    "accepts explicit ancestor interfaces on an %s interface owner",
    (interfaceOwner) => {
      const Named = ph.interface("Named", { fields: { label: ph.String() } });
      const Child = ph.interface("Child", {
        implements: [Named],
        fields: { label: ph.String() },
      });
      const Implementation = interfaceOwner
        ? ph.interface("Implementation", {
            implements: [Child, Named],
            fields: { label: ph.String() },
          })
        : ph.object("Implementation", {
            implements: [Child, Named],
            fields: { label: ph.String() },
          });
      const model = defineDocumentModel({
        id: "test/probe",
        name: "Probe",
        description: "",
        extension: "probe",
        version: 1,
        author: { name: "Powerhouse" },
        specifications: {
          global: {
            schema: ph.object("ProbeState", {
              fields: { item: ph.ref(Implementation) },
            }),
            initialValue: { item: null },
          },
          local: { schema: null, initialValue: {} },
        },
      }).finalize({ modules: [] });
      const artifact = artifactOf(model);
      expect(checkInterfaceImplementations(artifact)).toStrictEqual([]);
      expect(artifact.documentType).toBe("test/probe");
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
      implementationFields: { f: ph.String() },
      sdl: [
        "type ProbeState { item: Implementation }",
        "interface Contract { f: String }",
        "extend interface Contract { label: String }",
        "type Implementation { f: String }",
        "extend type Implementation implements Contract",
      ],
    });
    expect(summary(checkInterfaceImplementations(artifact))).toStrictEqual([
      {
        code: "PH-DM-INTERFACE-INVALID",
        path: OWNER_PATH,
        message:
          "Interface field Contract.label expected but Implementation does not provide it.",
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
    const artifact = probe({
      interfaceFields: { f: ph.String() },
      implementationFields: { f: ph.String() },
    });
    expect(checkInterfaceImplementations(artifact)).toStrictEqual([]);
    expect(
      artifact.definition.specifications[0].types.map(({ name }) => name),
    ).toStrictEqual(["ProbeState", "Implementation", "Contract"]);
  });

  it("reports construction failures and continues with the next specification version", () => {
    const bad = probe({
      interfaceFields: { f: ph.String() },
      implementationFields: { f: ph.String() },
    });
    const missing = probe({
      interfaceFields: { label: ph.String() },
      implementationFields: { other: ph.String() },
    });
    const artifact = {
      ...bad,
      definition: {
        ...bad.definition,
        specifications: [
          {
            ...bad.definition.specifications[0],
            graphQLCompatibility: schemaFirstGraphQLDocument([
              "type ProbeState { item: Implementation }",
              "interface Contract { f: String }",
              "type Implementation implements Contract { f: Undeclared }",
            ]),
          },
          { ...missing.definition.specifications[0], version: 2 },
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
        path: ["specifications", 1, "types", 1],
        message:
          "Interface field Contract.label expected but Implementation does not provide it.",
        definition: { kind: "document-model", key: "test/probe", version: 2 },
      },
    ]);
  });
});
