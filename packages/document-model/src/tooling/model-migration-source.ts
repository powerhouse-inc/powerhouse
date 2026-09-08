import type {
  DocumentModelDefinitionV1,
  DocumentModelSpecificationDefinitionV1,
  DocumentSpecification,
  FieldDefinitionV1,
  InputFieldDefinitionV1,
  NamedGraphQLTypeDefinitionV1,
  TypeReferenceDefinitionV1,
} from "@powerhousedao/shared/document-model";
import {
  deriveDocumentModelModuleNames,
  deriveDocumentModelOperationNames,
} from "../definition/naming.js";
import {
  isTypeScriptIdentifier,
  quoteJavaScriptValue as quoted,
} from "./source-rendering.js";

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

export type LegacyReducerBinding = {
  readonly version: number;
  readonly moduleKey: string;
  readonly importSpecifier: `./${string}` | `../${string}`;
  /** Exact reducer-map export generated for this document module. */
  readonly exportName: string;
};

export type LegacyUpgradeBinding = {
  readonly toVersion: number;
  readonly importSpecifier: `./${string}` | `../${string}`;
  readonly exportName: string;
};

export type RenderCodeFirstFamilyRequest = {
  readonly definition: DocumentModelDefinitionV1;
  readonly materializedSpecifications: readonly DocumentSpecification[];
  readonly exportBase?: string;
  readonly reducerBindings: readonly LegacyReducerBinding[];
  readonly upgradeBindings?: readonly LegacyUpgradeBinding[];
};

function property(key: string): string {
  return quoted(key);
}

function options(required: boolean): string {
  return required ? ", { required: true }" : "";
}

type TypeLocalNames = ReadonlyMap<string, string>;

function typeLocalName(names: TypeLocalNames, graphQLName: string): string {
  const localName = names.get(graphQLName);
  if (!localName) {
    throw new Error(`PH-MIGRATE-TYPE-REFERENCE-UNRESOLVED: ${graphQLName}`);
  }
  return localName;
}

function fieldExpression(
  type: TypeReferenceDefinitionV1,
  names: TypeLocalNames,
): string {
  if (type.kind === "scalar") {
    const factory = scalarFactories[type.name];
    if (!factory) {
      throw new Error(`PH-MIGRATE-SCALAR-UNRESOLVED: ${type.name}`);
    }
    return `ph.${factory}(${type.required ? "{ required: true }" : ""})`;
  }
  if (type.kind === "named") {
    return `ph.ref(() => ${typeLocalName(names, type.name)}${options(type.required)})`;
  }
  return `ph.list(${fieldExpression(type.item, names)}${options(type.required)})`;
}

function inputFieldExpression(
  field: InputFieldDefinitionV1,
  names: TypeLocalNames,
): string {
  if (Object.hasOwn(field, "defaultValue")) {
    throw new Error(`PH-MIGRATE-INPUT-DEFAULT-UNSUPPORTED: ${field.name}`);
  }
  return fieldExpression(field.type, names);
}

function outputFieldExpression(
  field: FieldDefinitionV1,
  names: TypeLocalNames,
): string {
  const returns = fieldExpression(field.type, names);
  if (!field.args?.length) return returns;
  return `ph.field({
  args: {
${field.args
  .map(
    (argument) =>
      `${property(argument.key)}: ${inputFieldExpression(argument, names)}`,
  )
  .join(",\n")}
  },
  returns: ${returns},
  ${field.description === null ? "" : `description: ${quoted(field.description)},`}
  ${field.deprecated === null ? "" : `deprecated: ${quoted(field.deprecated)},`}
})`;
}

function inputFieldsExpression(
  fields: readonly InputFieldDefinitionV1[],
  names: TypeLocalNames,
): string {
  return fields
    .map(
      (field) =>
        `${property(field.key)}: ${inputFieldExpression(field, names)}`,
    )
    .join(",\n");
}

function outputFieldsExpression(
  fields: readonly FieldDefinitionV1[],
  names: TypeLocalNames,
): string {
  return fields
    .map(
      (field) =>
        `${property(field.key)}: ${outputFieldExpression(field, names)}`,
    )
    .join(",\n");
}

function typeDeclaration(
  definition: NamedGraphQLTypeDefinitionV1,
  names: TypeLocalNames,
): string {
  const localName = typeLocalName(names, definition.name);
  const description =
    definition.description === null
      ? ""
      : `description: ${quoted(definition.description)},\n`;
  switch (definition.kind) {
    case "enum":
      return `const ${localName}: EnumDescriptor = ph.enum(${quoted(
        definition.name,
      )}, {
${description}values: ${quoted(
        definition.values.map(({ name }) => name),
      )} as const,
});`;
    case "union":
      return `const ${localName}: UnionDescriptor = ph.union(${quoted(
        definition.name,
      )}, {
${description}members: [${definition.members
        .map((member) => typeLocalName(names, member))
        .join(", ")}],
});`;
    case "interface":
      if (definition.implements?.length) {
        throw new Error(
          `PH-MIGRATE-INTERFACE-INHERITANCE-UNSUPPORTED: ${definition.name}`,
        );
      }
      return `const ${localName}: InterfaceDescriptor = ph.interface(${quoted(
        definition.name,
      )}, {
${description}fields: {
${outputFieldsExpression(definition.fields, names)}
},
});`;
    case "input":
      return `const ${localName}: InputDescriptor = ph.input(${quoted(
        definition.name,
      )}, {
${description}fields: {
${inputFieldsExpression(definition.fields, names)}
},
});`;
    case "object": {
      const implemented = definition.implements?.length
        ? `implements: [${definition.implements
            .map((implementedName) => typeLocalName(names, implementedName))
            .join(", ")}],\n`
        : "";
      return `const ${localName}: ObjectDescriptor = ph.object(${quoted(
        definition.name,
      )}, {
${description}${implemented}fields: {
${outputFieldsExpression(definition.fields, names)}
},
});`;
    }
  }
}

function inputExpression(
  input: NonNullable<
    DocumentModelSpecificationDefinitionV1["modules"][number]["operations"][number]["input"]
  >,
  names: TypeLocalNames,
): string {
  return `ph.input(${quoted(input.name)}, { fields: {
${inputFieldsExpression(input.fields, names)}
} })`;
}

function errorsExpression(
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

function bindingName(version: number, moduleIndex: number): string {
  return `legacyReducersV${version}M${moduleIndex}`;
}

function operationExpression(
  operation: DocumentModelSpecificationDefinitionV1["modules"][number]["operations"][number],
  reducerNamespace: string,
  reducerExportName: string,
  names: TypeLocalNames,
): string {
  if (operation.input === null) {
    throw new Error(`PH-MIGRATE-NO-INPUT-UNSUPPORTED: ${operation.actionType}`);
  }
  const reducerMethod = deriveDocumentModelOperationNames(operation.key, {
    hasInput: true,
  }).reducerMethod;
  const members = [
    operation.description === null
      ? ""
      : `description: ${quoted(operation.description)},`,
    `input: ${inputExpression(operation.input, names)},`,
    operation.errors.length
      ? `errors: {\n${errorsExpression(operation.errors)}\n},`
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
    `reduceLegacy(state, action, dispatch) {
  invokeLegacyReducer(${reducerNamespace}, ${quoted(
    reducerExportName,
  )}, ${quoted(reducerMethod)}, state, action, dispatch);
},`,
  ].filter(Boolean);
  return `${property(operation.key)}: ${operation.scope}({
${members.join("\n")}
})`;
}

function moduleDeclaration(
  specification: DocumentModelSpecificationDefinitionV1,
  moduleIndex: number,
  reducerBinding: LegacyReducerBinding,
  names: TypeLocalNames,
): string {
  const module = specification.modules.at(moduleIndex);
  if (!module) throw new Error(`Missing module ${moduleIndex}.`);
  const description =
    module.description === null
      ? ""
      : `description: ${quoted(module.description)},`;
  return `const module${moduleIndex} = model.module(${quoted(module.key)}, {
${description}
operations: ({ global, local }) => ({
${module.operations
  .map((operation) =>
    operationExpression(
      operation,
      bindingName(specification.version, moduleIndex),
      reducerBinding.exportName,
      names,
    ),
  )
  .join(",\n")}
}),
});`;
}

function versionFactory(request: {
  readonly exportBase: string;
  readonly definition: DocumentModelDefinitionV1;
  readonly specification: DocumentModelSpecificationDefinitionV1;
  readonly materialized: DocumentSpecification;
  readonly reducerBindings: readonly LegacyReducerBinding[];
}): string {
  const { definition, specification } = request;
  const names = new Map(
    specification.types.map(({ name }, index) => [name, `_type${index}`]),
  );
  if (names.size !== specification.types.length) {
    throw new Error("PH-MIGRATE-TYPE-NAME-DUPLICATE");
  }
  const declarationsByName = new Map(
    specification.types.map((type) => [type.name, type]),
  );
  const orderedTypes: NamedGraphQLTypeDefinitionV1[] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (type: NamedGraphQLTypeDefinitionV1): void => {
    if (visited.has(type.name)) return;
    if (visiting.has(type.name)) {
      throw new Error(`PH-MIGRATE-TYPE-DEPENDENCY-CYCLE: ${type.name}`);
    }
    visiting.add(type.name);
    const dependencies =
      type.kind === "union"
        ? type.members
        : type.kind === "object"
          ? (type.implements ?? [])
          : [];
    for (const dependencyName of dependencies) {
      const dependency = declarationsByName.get(dependencyName);
      if (!dependency) {
        throw new Error(
          `PH-MIGRATE-TYPE-REFERENCE-UNRESOLVED: ${dependencyName}`,
        );
      }
      visit(dependency);
    }
    visiting.delete(type.name);
    visited.add(type.name);
    orderedTypes.push(type);
  };
  specification.types.forEach(visit);
  const globalRoot = specification.state.global.root.name;
  const localRoot = specification.state.local.root?.name ?? null;
  const auxiliaryTypes = specification.types
    .map(({ name }) => name)
    .filter((name) => name !== globalRoot && name !== localRoot)
    .map((name) => typeLocalName(names, name));
  const compatibility = {
    kind: "explicit-legacy",
    definition: specification,
    materialized: request.materialized,
  };
  return `function create${request.exportBase}V${specification.version}() {
${orderedTypes.map((type) => typeDeclaration(type, names)).join("\n\n")}

const model = defineDocumentModel({
  id: ${quoted(definition.model.documentType)},
  name: ${quoted(definition.model.name)},
  description: ${quoted(definition.model.description)},
  extension: ${quoted(definition.model.extension)},
  version: ${specification.version},
  author: ${quoted(definition.model.author)},
  changeLog: ${quoted(specification.changeLog)},
  specifications: {
    ${
      auxiliaryTypes.length
        ? `auxiliaryTypes: [${auxiliaryTypes.join(", ")}],`
        : ""
    }
    global: {
      schema: ${typeLocalName(names, globalRoot)},
      initialValue: ${quoted(specification.state.global.initialValue)},
      examples: ${quoted(
        specification.state.global.examples.map(({ key, value }) => ({
          key,
          value,
        })),
      )},
    },
    local: {
      schema: ${localRoot === null ? "null" : typeLocalName(names, localRoot)},
      initialValue: ${quoted(specification.state.local.initialValue)},
      examples: ${quoted(
        specification.state.local.examples.map(({ key, value }) => ({
          key,
          value,
        })),
      )},
    },
  },
});

${specification.modules
  .map((module, moduleIndex) =>
    moduleDeclaration(
      specification,
      moduleIndex,
      requireBinding(
        request.reducerBindings,
        specification.version,
        module.key,
      ),
      names,
    ),
  )
  .join("\n\n")}

const compatibility: LegacySpecificationCompatibility = ${JSON.stringify(
    compatibility,
    null,
    2,
  )};
return model.version({
  modules: [${specification.modules
    .map((_, moduleIndex) => `module${moduleIndex}`)
    .join(", ")}],
  compatibility,
});
}`;
}

function requireBinding<
  T extends { readonly version: number; readonly moduleKey: string },
>(bindings: readonly T[], version: number, moduleKey: string): T {
  const matches = bindings.filter(
    (candidate) =>
      candidate.version === version && candidate.moduleKey === moduleKey,
  );
  if (matches.length === 0) {
    throw new Error(
      `PH-MIGRATE-REDUCER-BINDING-MISSING: v${version}/${moduleKey}`,
    );
  }
  if (matches.length > 1) {
    throw new Error(
      `PH-MIGRATE-REDUCER-BINDING-AMBIGUOUS: v${version}/${moduleKey}`,
    );
  }
  return matches[0]!;
}

/** Renders a deterministic verification-only family beside its legacy source. */
export function renderCodeFirstDocumentModelFamily(
  request: RenderCodeFirstFamilyRequest,
): string {
  const { definition } = request;
  const exportBase = request.exportBase ?? definition.model.graphQLName;
  if (!isTypeScriptIdentifier(exportBase)) {
    throw new Error(`PH-MIGRATE-EXPORT-NAME-INVALID: ${exportBase}`);
  }
  if (
    request.materializedSpecifications.length !==
    definition.specifications.length
  ) {
    throw new Error("PH-MIGRATE-SPECIFICATION-COUNT-MISMATCH");
  }
  const reducerImports = definition.specifications.flatMap((specification) =>
    specification.modules.map((module, moduleIndex) => {
      const binding = requireBinding(
        request.reducerBindings,
        specification.version,
        module.key,
      );
      return `import * as ${bindingName(
        specification.version,
        moduleIndex,
      )} from ${quoted(binding.importSpecifier)};`;
    }),
  );
  const versions = definition.specifications.map(({ version }) => version);
  const upgradeBindings = request.upgradeBindings ?? [];
  const upgradeImports = versions.slice(1).map((version) => {
    const binding = upgradeBindings.find(
      (candidate) => candidate.toVersion === version,
    );
    if (!binding) {
      throw new Error(`PH-MIGRATE-UPGRADE-BINDING-MISSING: v${version}`);
    }
    if (!isTypeScriptIdentifier(binding.exportName)) {
      throw new Error(
        `PH-MIGRATE-UPGRADE-EXPORT-NAME-INVALID: ${binding.exportName}`,
      );
    }
    return `import { ${binding.exportName} as legacyUpgradeV${version} } from ${quoted(
      binding.importSpecifier,
    )};`;
  });
  const factories = definition.specifications.map((specification, index) =>
    versionFactory({
      exportBase,
      definition,
      specification,
      materialized: request.materializedSpecifications[index]!,
      reducerBindings: request.reducerBindings,
    }),
  );
  const familyName = `${exportBase}VerificationFamily`;
  return `import {
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
${reducerImports.join("\n")}
${upgradeImports.join("\n")}

type LegacyReducer = (
  state: unknown,
  action: unknown,
  dispatch: unknown,
) => void;

function invokeLegacyReducer(
  namespace: object,
  exportName: string,
  method: string,
  state: unknown,
  action: unknown,
  dispatch: unknown,
): void {
  const candidate = (namespace as Record<string, unknown>)[exportName];
  if (
    candidate !== null &&
    typeof candidate === "object" &&
    typeof (candidate as Record<string, unknown>)[method] === "function"
  ) {
    ((candidate as Record<string, unknown>)[method] as LegacyReducer)(
      state,
      action,
      dispatch,
    );
    return;
  }
  throw new Error(
    \`Legacy reducer \${exportName}.\${method} was not found.\`,
  );
}

${factories.join("\n\n")}

const ${familyName} = defineDocumentModelFamily({
  versions: [${versions
    .map((version) => `create${exportBase}V${version}()`)
    .join(", ")}],
  upgrades: [${versions
    .slice(1)
    .map((version) => `legacyUpgradeV${version}`)
    .join(", ")}],
});

${versions
  .map(
    (version) =>
      `export const ${exportBase}V${version} = ${familyName}.at(${version});`,
  )
  .join("\n")}
export const documentModels = ${familyName}.modules;
export const upgradeManifests = [${familyName}.upgradeManifest];
`;
}

export function inferLegacyReducerBindings(request: {
  readonly definition: DocumentModelDefinitionV1;
  readonly legacyImportBase: `./${string}` | `../${string}`;
}): readonly LegacyReducerBinding[] {
  return request.definition.specifications.flatMap((specification) =>
    specification.modules.map((module) => ({
      version: specification.version,
      moduleKey: module.key,
      importSpecifier: `${request.legacyImportBase}/v${
        specification.version
      }/src/reducers/${
        deriveDocumentModelModuleNames(
          request.definition.model.name,
          module.key,
        ).directoryName
      }.js` as `../${string}` | `./${string}`,
      exportName: deriveDocumentModelModuleNames(
        request.definition.model.name,
        module.key,
      ).operationsValueName,
    })),
  );
}

export function inferLegacyUpgradeBindings(request: {
  readonly definition: DocumentModelDefinitionV1;
  readonly legacyImportBase: `./${string}` | `../${string}`;
}): readonly LegacyUpgradeBinding[] {
  return request.definition.specifications.slice(1).map(({ version }) => ({
    toVersion: version,
    importSpecifier: `${request.legacyImportBase}/upgrades/v${version}.js` as
      | `../${string}`
      | `./${string}`,
    exportName: `v${version}`,
  }));
}
