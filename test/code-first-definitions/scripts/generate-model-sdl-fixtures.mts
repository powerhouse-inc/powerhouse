import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  DocumentModelDefinitionV1,
  DocumentModelGlobalState,
  GraphQLObjectTypeDefinitionNodeV1,
  JsonValue,
  ObjectTypeDefinitionV1,
} from "@powerhousedao/shared/document-model";
import {
  projectLegacyModelSdl,
  projectStructuredModelSdl,
} from "../src/evidence/model-sdl.js";
import { readJson, sha256 } from "../src/evidence/utils.js";

const packageRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const repositoryRoot = resolve(packageRoot, "../..");
const fixtureRoot = resolve(packageRoot, "fixtures/model-sdl/v1");
const definitionRoot = resolve(fixtureRoot, "definitions");
const sdlRoot = resolve(fixtureRoot, "sdl");
const astRoot = resolve(fixtureRoot, "ast");

/** The wire types are deeply readonly, but the fixture generators edit a
 * clone in place; this view keeps the shapes typed while doing so. */
type Mutable<T> = T extends readonly (infer Item)[]
  ? Mutable<Item>[]
  : T extends object
    ? { -readonly [Key in keyof T]: Mutable<T[Key]> }
    : T;

function descriptorVariants(
  source: DocumentModelDefinitionV1,
): DocumentModelDefinitionV1 {
  const definition = structuredClone(
    source,
  ) as Mutable<DocumentModelDefinitionV1>;
  const specification = definition.specifications[0]!;
  const root = specification.types.find(
    (candidate): candidate is Mutable<ObjectTypeDefinitionV1> =>
      candidate.kind === "object" && candidate.name === "InvoiceState",
  );
  if (!root) {
    throw new Error("The invoice fixture has no InvoiceState object type.");
  }
  root.fields.push(
    {
      key: "auditTrail",
      name: "auditTrail",
      description: "Nested list nullability probe.",
      deprecated: null,
      type: {
        kind: "list",
        required: true,
        item: {
          kind: "list",
          required: false,
          item: { kind: "scalar", name: "String", required: true },
        },
      },
    },
    {
      key: "payment",
      name: "payment",
      description: null,
      deprecated: null,
      type: { kind: "named", name: "PaymentMethod", required: false },
    },
    {
      key: "summary",
      name: "summary",
      description: "Computed-field argument projection probe.",
      deprecated: "Use the state fields directly.",
      args: [
        {
          key: "locale",
          name: "locale",
          description: null,
          deprecated: null,
          type: { kind: "scalar", name: "String", required: false },
          defaultValue: "en",
        },
      ],
      type: { kind: "scalar", name: "String", required: true },
    },
  );
  specification.types.push(
    {
      kind: "interface",
      name: "Payable",
      description: "A payment discriminator interface.",
      fields: [
        {
          key: "reference",
          name: "reference",
          description: null,
          deprecated: null,
          type: { kind: "scalar", name: "String", required: true },
        },
      ],
    },
    {
      kind: "object",
      name: "WirePayment",
      description: null,
      implements: ["Payable"],
      fields: [
        {
          key: "reference",
          name: "reference",
          description: null,
          deprecated: null,
          type: { kind: "scalar", name: "String", required: true },
        },
        {
          key: "bank",
          name: "bank",
          description: null,
          deprecated: null,
          type: { kind: "scalar", name: "String", required: true },
        },
      ],
    },
    {
      kind: "object",
      name: "CardPayment",
      description: null,
      implements: ["Payable"],
      fields: [
        {
          key: "reference",
          name: "reference",
          description: null,
          deprecated: null,
          type: { kind: "scalar", name: "String", required: true },
        },
        {
          key: "lastFour",
          name: "lastFour",
          description: null,
          deprecated: null,
          type: { kind: "scalar", name: "String", required: true },
        },
      ],
    },
    {
      kind: "union",
      name: "PaymentMethod",
      description: null,
      members: ["WirePayment", "CardPayment"],
    },
    {
      kind: "input",
      name: "InvoiceSearchInput",
      description: "Unreachable input retained by descriptor projection.",
      unknownKeys: "preserve",
      fields: [
        {
          key: "query",
          name: "query",
          description: null,
          deprecated: null,
          type: { kind: "scalar", name: "String", required: false },
        },
      ],
    },
    {
      kind: "object",
      name: "UnreachableAuditRecord",
      description: "An intentionally unreachable auxiliary type.",
      fields: [
        {
          key: "id",
          name: "id",
          description: null,
          deprecated: null,
          type: { kind: "scalar", name: "ID", required: true },
        },
      ],
    },
  );
  const initialValue = specification.state.global.initialValue as {
    [key: string]: JsonValue;
  };
  initialValue.auditTrail = [];
  initialValue.payment = null;
  return definition;
}

function completeCompatibilityAst(
  source: DocumentModelDefinitionV1,
): DocumentModelDefinitionV1 {
  const definition = structuredClone(
    source,
  ) as Mutable<DocumentModelDefinitionV1>;
  const compatibility = definition.specifications.at(-1)?.graphQLCompatibility;
  if (!compatibility) {
    throw new Error("The todo fixture has no legacy compatibility document.");
  }
  const document = compatibility.document;
  const todo = document.definitions.find(
    (candidate): candidate is Mutable<GraphQLObjectTypeDefinitionNodeV1> =>
      candidate.kind === "ObjectTypeDefinition" &&
      candidate.name.value === "TodoState",
  );
  if (!todo) {
    throw new Error("The compatibility document has no TodoState type.");
  }
  todo.directives.push({
    kind: "Directive",
    name: { kind: "Name", value: "fixtureTag" },
    arguments: [
      {
        kind: "Argument",
        name: { kind: "Name", value: "name" },
        value: { kind: "StringValue", value: "state", block: false },
      },
    ],
  });
  document.definitions = [
    {
      kind: "SchemaDefinition",
      directives: [],
      operationTypes: [
        {
          kind: "OperationTypeDefinition",
          operation: "query",
          type: { kind: "NamedType", name: { kind: "Name", value: "Query" } },
        },
      ],
    },
    {
      kind: "DirectiveDefinition",
      name: { kind: "Name", value: "fixtureTag" },
      arguments: [
        {
          kind: "InputValueDefinition",
          name: { kind: "Name", value: "name" },
          type: {
            kind: "NonNullType",
            type: {
              kind: "NamedType",
              name: { kind: "Name", value: "String" },
            },
          },
          directives: [],
        },
      ],
      repeatable: false,
      locations: [{ kind: "Name", value: "OBJECT" }],
    },
    {
      kind: "ScalarTypeDefinition",
      name: { kind: "Name", value: "Unknown" },
      directives: [],
    },
    {
      kind: "ScalarTypeDefinition",
      name: { kind: "Name", value: "Address" },
      directives: [],
    },
    ...document.definitions,
    {
      kind: "ObjectTypeExtension",
      name: { kind: "Name", value: "TodoState" },
      interfaces: [],
      directives: [],
      fields: [
        {
          kind: "FieldDefinition",
          name: { kind: "Name", value: "legacyNote" },
          arguments: [],
          type: {
            kind: "NamedType",
            name: { kind: "Name", value: "String" },
          },
          directives: [],
        },
      ],
    },
  ];
  return definition;
}

async function main(): Promise<void> {
  await Promise.all(
    [fixtureRoot, definitionRoot, sdlRoot, astRoot].map((path) =>
      mkdir(path, { recursive: true }),
    ),
  );
  const invoice = await readJson<DocumentModelDefinitionV1>(
    resolve(
      repositoryRoot,
      "cf-spec/fixtures/v1/document-model-definition.json",
    ),
  );
  const todoV1 = await readJson<DocumentModelDefinitionV1>(
    resolve(
      packageRoot,
      "fixtures/definitions/v1/goldens/versioned-todo-v1.definition.json",
    ),
  );
  const todoV2 = await readJson<DocumentModelDefinitionV1>(
    resolve(
      packageRoot,
      "fixtures/definitions/v1/goldens/versioned-todo-v2.definition.json",
    ),
  );
  const todoV1State = await readJson<{
    readonly global: DocumentModelGlobalState;
  }>(
    resolve(
      packageRoot,
      "fixtures/definitions/v1/goldens/versioned-todo-v1.state.json",
    ),
  );
  const todoV2State = await readJson<{
    readonly global: DocumentModelGlobalState;
  }>(
    resolve(
      packageRoot,
      "fixtures/definitions/v1/goldens/versioned-todo-v2.state.json",
    ),
  );
  const definitions = [
    {
      caseId: "descriptor-variants-v1",
      definition: descriptorVariants(invoice),
      legacyGlobal: null,
      coveredVariants: [
        "descriptor",
        "scalar-field",
        "named-field",
        "nested-list",
        "all-nullability",
        "enum",
        "object",
        "input",
        "interface",
        "union",
        "field-arguments",
        "deprecation",
        "operation",
        "error",
        "local-state",
        "unreachable-type",
      ],
    },
    {
      caseId: "versioned-todo-v1",
      definition: todoV1,
      legacyGlobal: todoV1State.global,
      coveredVariants: ["compatibility-ast", "version-1", "operations"],
    },
    {
      caseId: "versioned-todo-v2",
      definition: todoV2,
      legacyGlobal: todoV2State.global,
      coveredVariants: ["compatibility-ast", "version-2", "operations"],
    },
    {
      caseId: "complete-compatibility-ast-v1",
      definition: completeCompatibilityAst(todoV2),
      legacyGlobal: null,
      coveredVariants: [
        "schema-definition",
        "directive-definition",
        "directive-use",
        "type-extension",
        "source-order",
      ],
    },
  ] as const;

  const cases = [];
  const scalarNames: string[] = [];
  for (const fixture of definitions) {
    const projection = projectStructuredModelSdl(fixture.definition);
    for (const name of projection.scalarNames) {
      if (!scalarNames.includes(name)) scalarNames.push(name);
    }
    const definitionName = `definitions/${fixture.caseId}.json`;
    const sdlName = `sdl/${fixture.caseId}.graphql`;
    const astName = `ast/${fixture.caseId}.json`;
    await Promise.all([
      writeFile(
        resolve(fixtureRoot, definitionName),
        `${JSON.stringify(fixture.definition, null, 2)}\n`,
      ),
      writeFile(resolve(fixtureRoot, sdlName), projection.sdl),
      writeFile(
        resolve(fixtureRoot, astName),
        `${JSON.stringify(projection.ast, null, 2)}\n`,
      ),
    ]);
    cases.push({
      caseId: fixture.caseId,
      definition: `./${definitionName}`,
      expectedSdl: `./${sdlName}`,
      expectedAst: `./${astName}`,
      legacyComparison: fixture.legacyGlobal
        ? (() => {
            const legacy = projectLegacyModelSdl(fixture.legacyGlobal);
            return {
              sdlDigest: legacy.sdlDigest,
              astDigest: legacy.astDigest,
            };
          })()
        : null,
      coveredVariants: fixture.coveredVariants,
    });
  }
  const canonicalScalarNames = scalarNames.sort();
  const scalarInventory = {
    names: canonicalScalarNames,
    digest: sha256(JSON.stringify(canonicalScalarNames)),
  };
  await writeFile(
    resolve(fixtureRoot, "scalar-inventory-digest.json"),
    `${JSON.stringify(scalarInventory, null, 2)}\n`,
  );

  const fixtureSchema = await readFile(
    resolve(packageRoot, "schemas/gate-fixture-manifest-v1.schema.json"),
  );
  const contract = await readFile(
    resolve(repositoryRoot, "cf-spec/08-implementation-plan.md"),
  );
  const dependency = async (gate: "B1" | "B9") => {
    const manifest = await readFile(
      gate === "B1"
        ? resolve(packageRoot, "fixtures/definitions/v1/manifest.json")
        : resolve(
            packageRoot,
            "fixtures/reproductions/v1/failure-propagation/manifest.json",
          ),
    );
    return {
      gate,
      contractRevision: sha256(contract),
      fixtureManifestDigest: sha256(manifest),
    };
  };
  const manifest = {
    kind: "powerhouse.gate-fixture-manifest",
    formatVersion: 1,
    gate: "B6",
    fixtureVersion: "model-sdl-v1",
    caseCount: cases.length,
    requiredTools: { node: process.version, graphql: "locked-workspace" },
    schemaDigest: sha256(fixtureSchema),
    directDependencies: await Promise.all([dependency("B1"), dependency("B9")]),
    scalarInventory: "./scalar-inventory-digest.json",
    cases,
  };
  await writeFile(
    resolve(fixtureRoot, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
}

await main();
