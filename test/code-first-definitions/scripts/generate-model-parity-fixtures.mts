import {
  createState,
  defaultBaseState,
  type DocumentModelModule,
  type DocumentModelSpecificationDefinitionV1,
  type DocumentSpecification,
  type FieldDefinitionV1,
  type InputFieldDefinitionV1,
  type JsonValue,
  type NamedGraphQLTypeDefinitionV1,
  type TypeReferenceDefinitionV1,
} from "@powerhousedao/shared/document-model";
import {
  LegacyDocumentModelModuleAdapter,
  type LegacyGraphQLDocumentParserInterface,
} from "document-model/tooling";
import { parse } from "graphql";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readJson, sha256, writeJson } from "../src/evidence/utils.js";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = resolve(packageRoot, "../..");
const fixtureRoot = resolve(packageRoot, "fixtures/definitions/v1");

const roots = [
  {
    rootId: "document-drive",
    source: "packages/shared/document-drive/document-drive.json",
    exportBase: "DocumentDrive",
  },
  {
    rootId: "reactor-group",
    source:
      "packages/reactor-group/document-models/reactor-group/reactor-group.json",
    exportBase: "ReactorGroup",
  },
  {
    rootId: "app-module",
    source: "packages/vetra/document-models/app-module/app-module.json",
    exportBase: "AppModule",
  },
  {
    rootId: "document-editor",
    source:
      "packages/vetra/document-models/document-editor/document-editor.json",
    exportBase: "DocumentEditor",
  },
  {
    rootId: "processor-module",
    source:
      "packages/vetra/document-models/processor-module/processor-module.json",
    exportBase: "ProcessorModule",
  },
  {
    rootId: "subgraph-module",
    source:
      "packages/vetra/document-models/subgraph-module/subgraph-module.json",
    exportBase: "SubgraphModule",
  },
  {
    rootId: "vetra-package",
    source: "packages/vetra/document-models/vetra-package/vetra-package.json",
    exportBase: "VetraPackage",
  },
  {
    rootId: "package-e2e-todo",
    source: "test/package-e2e/fixtures/todo.json",
    exportBase: "PackageTodo",
  },
  {
    rootId: "versioned-todo",
    source: "test/versioned-documents/document-models/todo/todo.json",
    exportBase: "VersionedTodo",
  },
] as const;

const scalarFactories: Readonly<Record<string, string>> = {
  ID: "ID",
  String: "String",
  Boolean: "Boolean",
  Int: "Int",
  Float: "Float",
  PHID: "PHID",
  OID: "OID",
  OLabel: "OLabel",
  Currency: "Currency",
  EmailAddress: "EmailAddress",
  EthereumAddress: "EthereumAddress",
  URL: "URL",
  Date: "Date",
  DateTime: "DateTime",
  Amount_Money: "Money",
  Amount_Percentage: "Percentage",
  Amount_Tokens: "Tokens",
  Amount: "Amount",
  Amount_Fiat: "AmountFiat",
  Amount_Crypto: "AmountCrypto",
  Amount_Currency: "AmountCurrency",
  Address: "Address",
  AttachmentRef: "AttachmentRef",
  Unknown: "Unknown",
  Upload: "Upload",
  JSONObject: "JSONObject",
};

type StoredRoot = {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly extension: string;
  readonly author: { readonly name: string; readonly website?: string | null };
  readonly specifications: readonly DocumentSpecification[];
};

type StoredDocument = {
  readonly state?: { readonly global?: StoredRoot };
} & Partial<StoredRoot>;

function quoted(value: unknown): string {
  return JSON.stringify(value);
}

function property(key: string): string {
  return quoted(key);
}

function options(required: boolean): string {
  return required ? ", { required: true }" : "";
}

function fieldExpression(type: TypeReferenceDefinitionV1): string {
  if (type.kind === "scalar") {
    const factory = scalarFactories[type.name];
    if (!factory) throw new Error(`No ph scalar factory for ${type.name}`);
    return `ph.${factory}(${type.required ? "{ required: true }" : ""})`;
  }
  if (type.kind === "named") {
    return `ph.ref(() => ${type.name}${options(type.required)})`;
  }
  return `ph.list(${fieldExpression(type.item)}${options(type.required)})`;
}

function assertNoUnsupportedInputMetadata(field: InputFieldDefinitionV1): void {
  if (Object.hasOwn(field, "defaultValue")) {
    throw new Error(
      `Parity fixture input ${field.name} has an unsupported default value`,
    );
  }
}

function fieldsExpression(
  fields: readonly (FieldDefinitionV1 | InputFieldDefinitionV1)[],
): string {
  return fields
    .map((field) => {
      if ("defaultValue" in field) assertNoUnsupportedInputMetadata(field);
      if ("args" in field && field.args?.length) {
        throw new Error(
          `Parity fixture field ${field.name} requires ph.field generation`,
        );
      }
      return `${property(field.key)}: ${fieldExpression(field.type)}`;
    })
    .join(",\n");
}

function typeDeclaration(definition: NamedGraphQLTypeDefinitionV1): string {
  const description =
    definition.description === null
      ? ""
      : `description: ${quoted(definition.description)},\n`;
  switch (definition.kind) {
    case "enum":
      return `const ${definition.name}: EnumDescriptor = ph.enum(${quoted(
        definition.name,
      )}, {\n${description}values: ${quoted(
        definition.values.map(({ name }) => name),
      )} as const,\n});`;
    case "union":
      return `const ${definition.name}: UnionDescriptor = ph.union(${quoted(
        definition.name,
      )}, {\n${description}members: [${definition.members.join(", ")}],\n});`;
    case "interface":
      if (definition.implements?.length) {
        throw new Error(
          `Interface inheritance is not supported in ${definition.name}`,
        );
      }
      return `const ${definition.name}: InterfaceDescriptor = ph.interface(${quoted(
        definition.name,
      )}, {\n${description}fields: {\n${fieldsExpression(
        definition.fields,
      )}\n},\n});`;
    case "input":
      return `const ${definition.name}: InputDescriptor = ph.input(${quoted(
        definition.name,
      )}, {\n${description}fields: {\n${fieldsExpression(
        definition.fields,
      )}\n},\n});`;
    case "object": {
      const implemented = definition.implements?.length
        ? `implements: [${definition.implements.join(", ")}],\n`
        : "";
      return `const ${definition.name}: ObjectDescriptor = ph.object(${quoted(
        definition.name,
      )}, {\n${description}${implemented}fields: {\n${fieldsExpression(
        definition.fields,
      )}\n},\n});`;
    }
  }
}

function operationInputExpression(
  input: NonNullable<
    DocumentModelSpecificationDefinitionV1["modules"][number]["operations"][number]["input"]
  >,
): string {
  return `ph.input(${quoted(input.name)}, { fields: {\n${fieldsExpression(
    input.fields,
  )}\n} })`;
}

function errorExpression(
  errors: DocumentModelSpecificationDefinitionV1["modules"][number]["operations"][number]["errors"],
): string {
  return errors
    .map(
      (error) => `${property(error.key)}: {
  code: ${quoted(error.code)},
  name: ${quoted(error.name)},
  description: ${quoted(error.description)},
  template: ${quoted(error.template)},
}`,
    )
    .join(",\n");
}

function operationExpression(
  operation: DocumentModelSpecificationDefinitionV1["modules"][number]["operations"][number],
): string {
  if (operation.input === null) {
    throw new Error(
      `Core V1 parity fixture ${operation.key} has no operation input`,
    );
  }
  const members = [
    operation.description === null
      ? ""
      : `description: ${quoted(operation.description)},`,
    `input: ${operationInputExpression(operation.input)},`,
    operation.errors.length
      ? `errors: {\n${errorExpression(operation.errors)}\n},`
      : "",
    operation.examples.length
      ? `examples: ${quoted(
          operation.examples.map(({ key, value }) => ({ key, value })),
        )},`
      : "",
    operation.template === null
      ? ""
      : `template: ${quoted(operation.template)},`,
    operation.reducer === null
      ? ""
      : `reducerTemplate: ${quoted(operation.reducer)},`,
    "reduceLegacy(_state, _action, _dispatch) {},",
  ].filter(Boolean);
  return `${property(operation.creatorKey)}: ${operation.scope}({\n${members.join(
    "\n",
  )}\n})`;
}

function moduleDeclaration(
  module: DocumentModelSpecificationDefinitionV1["modules"][number],
  index: number,
): string {
  const description =
    module.description === null
      ? ""
      : `description: ${quoted(module.description)},`;
  return `const module${index} = model.module(${quoted(module.key)}, {
${description}
operations: ({ global, local }) => ({
${module.operations.map(operationExpression).join(",\n")}
}),
});`;
}

function versionFactory(request: {
  readonly exportBase: string;
  readonly model: {
    readonly documentType: string;
    readonly name: string;
    readonly description: string;
    readonly extension: string;
    readonly author: { readonly name: string; readonly website: string | null };
  };
  readonly definition: DocumentModelSpecificationDefinitionV1;
  readonly materialized: DocumentSpecification;
}): string {
  const { definition } = request;
  const globalRoot = definition.state.global.root.name;
  const localRoot = definition.state.local.root?.name ?? null;
  const auxiliaryTypes = definition.types
    .map(({ name }) => name)
    .filter((name) => name !== globalRoot && name !== localRoot);
  const compatibility = {
    kind: "explicit-legacy",
    definition,
    materialized: request.materialized,
  };
  return `function create${request.exportBase}V${definition.version}() {
${definition.types.map(typeDeclaration).join("\n\n")}

const model = defineDocumentModel({
  id: ${quoted(request.model.documentType)},
  name: ${quoted(request.model.name)},
  description: ${quoted(request.model.description)},
  extension: ${quoted(request.model.extension)},
  version: ${definition.version},
  author: ${quoted(request.model.author)},
  changeLog: ${quoted(definition.changeLog)},
  specifications: {
    ${
      auxiliaryTypes.length
        ? `auxiliaryTypes: [${auxiliaryTypes.join(", ")}],`
        : ""
    }
    global: {
      schema: ${globalRoot},
      initialValue: ${quoted(definition.state.global.initialValue)},
      examples: ${quoted(
        definition.state.global.examples.map(({ key, value }) => ({
          key,
          value,
        })),
      )},
    },
    local: {
      schema: ${localRoot ?? "null"},
      initialValue: ${quoted(definition.state.local.initialValue)},
      examples: ${quoted(
        definition.state.local.examples.map(({ key, value }) => ({
          key,
          value,
        })),
      )},
    },
  },
});

${definition.modules.map(moduleDeclaration).join("\n\n")}

const compatibility: LegacySpecificationCompatibility = ${JSON.stringify(
    compatibility,
    null,
    2,
  )};
return model.version({
  modules: [${definition.modules.map((_, index) => `module${index}`).join(", ")}],
  compatibility,
});
}`;
}

function identityVector(
  specification: DocumentModelSpecificationDefinitionV1,
): JsonValue {
  const entries: { path: (string | number)[]; id: string }[] = [];
  specification.state.global.examples.forEach((example, index) =>
    entries.push({
      path: ["state", "global", "examples", index],
      id: example.id,
    }),
  );
  specification.state.local.examples.forEach((example, index) =>
    entries.push({
      path: ["state", "local", "examples", index],
      id: example.id,
    }),
  );
  specification.modules.forEach((module, moduleIndex) => {
    entries.push({ path: ["modules", moduleIndex], id: module.id });
    module.operations.forEach((operation, operationIndex) => {
      entries.push({
        path: ["modules", moduleIndex, "operations", operationIndex],
        id: operation.id,
      });
      operation.errors.forEach((error, errorIndex) =>
        entries.push({
          path: [
            "modules",
            moduleIndex,
            "operations",
            operationIndex,
            "errors",
            errorIndex,
          ],
          id: error.id,
        }),
      );
      operation.examples.forEach((example, exampleIndex) =>
        entries.push({
          path: [
            "modules",
            moduleIndex,
            "operations",
            operationIndex,
            "examples",
            exampleIndex,
          ],
          id: example.id,
        }),
      );
    });
  });
  return { version: specification.version, entries };
}

const parser: LegacyGraphQLDocumentParserInterface = { parse };
const adapter = new LegacyDocumentModelModuleAdapter(parser);
const cases: Record<string, unknown>[] = [];

for (const root of roots) {
  const storedDocument = (await readJson(
    resolve(repositoryRoot, root.source),
  )) as StoredDocument;
  const global = (storedDocument.state?.global ?? storedDocument) as StoredRoot;
  const documentModel = createState(defaultBaseState(), global as never);
  const fakeModule = {
    version: 1,
    reducer: () => documentModel,
    actions: {},
    utils: {},
    documentModel,
  } as unknown as DocumentModelModule;
  const normalized = adapter.adapt(fakeModule).definition;
  const factories = normalized.specifications.map((definition, index) =>
    versionFactory({
      exportBase: root.exportBase,
      model: normalized.model,
      definition,
      materialized: global.specifications[index]!,
    }),
  );
  const versions = normalized.specifications.map(({ version }) => version);
  const familyName = `${root.exportBase}Family`;
  const source = `import {
  defineDocumentModel,
  defineDocumentModelFamily,
  ph,
  type EnumDescriptor,
  type InputDescriptor,
  type InterfaceDescriptor,
  type LegacySpecificationCompatibility,
  type ObjectDescriptor,
  type UnionDescriptor,
} from "document-model";

${factories.join("\n\n")}

const ${familyName} = defineDocumentModelFamily({
  versions: [${versions
    .map((version) => `create${root.exportBase}V${version}()`)
    .join(", ")}],
  upgrades: [${versions
    .slice(1)
    .map(
      (version) =>
        `{ toVersion: ${version}, upgradeReducer(document) { return document; } }`,
    )
    .join(", ")}],
});

${versions
  .map(
    (version) =>
      `export const ${root.exportBase}V${version} = ${familyName}.at(${version});`,
  )
  .join("\n")}
export const documentModels = ${familyName}.modules;
export const upgradeManifests = [${familyName}.upgradeManifest];
`;
  const sourceRelative = `fixtures/definitions/v1/code-first/${root.rootId}.ts`;
  await mkdir(resolve(packageRoot, dirname(sourceRelative)), {
    recursive: true,
  });
  await writeFile(resolve(packageRoot, sourceRelative), source, "utf8");

  for (const [index, specification] of normalized.specifications.entries()) {
    const version = specification.version;
    const caseId = `${root.rootId}-v${version}`;
    const goldenRoot = resolve(fixtureRoot, "goldens", caseId);
    await writeJson(`${goldenRoot}.definition.json`, normalized);
    await writeJson(`${goldenRoot}.state.json`, documentModel);
    await writeJson(
      `${goldenRoot}.identity.json`,
      identityVector(specification),
    );
    cases.push({
      caseId,
      rootId: root.rootId,
      documentType: normalized.model.documentType,
      version,
      legacySource: root.source,
      codeFirstSource: `./${sourceRelative}`,
      codeFirstExport: `${root.exportBase}V${version}`,
      structuredGolden: `./fixtures/definitions/v1/goldens/${caseId}.definition.json`,
      storedStateGolden: `./fixtures/definitions/v1/goldens/${caseId}.state.json`,
      identityVector: `./fixtures/definitions/v1/goldens/${caseId}.identity.json`,
      definitionSchema: "./schemas/document-model-definition-v1.schema.json",
    });
  }
}

const gateSchema = await readFile(
  resolve(packageRoot, "schemas/gate-fixture-manifest-v1.schema.json"),
);
const contract = await readFile(
  resolve(repositoryRoot, "cf-spec/08-implementation-plan.md"),
);
const b9Manifest = await readFile(
  resolve(
    packageRoot,
    "fixtures/reproductions/v1/failure-propagation/manifest.json",
  ),
);

await writeJson(resolve(fixtureRoot, "manifest.json"), {
  kind: "powerhouse.gate-fixture-manifest",
  formatVersion: 1,
  gate: "B1",
  fixtureVersion: "1.0.0",
  requiredTools: {
    node: ">=24",
    graphql: "catalog",
    tsx: "catalog",
  },
  schemaDigest: sha256(gateSchema),
  directDependencies: [
    {
      gate: "B9",
      contractRevision: sha256(contract),
      fixtureManifestDigest: sha256(b9Manifest),
    },
  ],
  caseCount: cases.length,
  cases,
  negativeCases: {
    fieldOptions: [
      "minLength",
      "maxLength",
      "min",
      "max",
      "regex",
      "minItems",
      "maxItems",
    ],
    stateRoots: [
      "missing-global",
      "input-global",
      "enum-global",
      "union-global",
      "field-global",
      "wrong-global-name",
      "wrong-local-name",
    ],
  },
});

process.stdout.write(
  `Generated ${cases.length} model parity cases under ${relative(
    repositoryRoot,
    fixtureRoot,
  )}.\n`,
);
