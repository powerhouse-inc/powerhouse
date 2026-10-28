import type { CodegenConfig } from "@graphql-codegen/cli";
import { generate } from "@graphql-codegen/cli";
import type { TypeScriptPluginConfig } from "@graphql-codegen/typescript";
import { documentModelScalars, scalarCatalog } from "document-model/scalars";
import type { DocumentModelFileMakerArgs } from "file-builders";
import type { TypeNode } from "graphql";
import { Kind, parse } from "graphql";
import type { ValidationSchemaPluginConfig } from "graphql-codegen-typescript-validation-schema";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { formatFileText } from "utils";
import { format as oxfmtFormat } from "oxfmt";
import {
  getProjectScalarNames,
  type ProjectScalars,
  projectScalarCodegenConfig,
  projectScalarsImportPath,
} from "./project-scalars.js";
import { resolveFromCodegen } from "./resolve-from-codegen.js";
import { buildGraphqlDocumentStringForSpecification } from "./specification-schema.js";

type PluginLoader = NonNullable<CodegenConfig["pluginLoader"]>;
type CodegenPlugin = Awaited<ReturnType<PluginLoader>>;
const pluginLoader: PluginLoader = async (name) =>
  (await import(pathToFileURL(resolveFromCodegen(name)).href)) as CodegenPlugin;

export const scalars = Object.fromEntries(
  documentModelScalars.map(({ name, typescriptType }) => [
    name,
    typescriptType,
  ]),
);

export const scalarsValidation = Object.fromEntries(
  documentModelScalars.map(({ name, zodSource }) => [name, zodSource]),
);

// Scalars codegen validates with strict `z.iso.datetime()`.
const DATE_LIKE_SCALARS = new Set(["Date", "DateTime"]);

const SCALAR_MOCK_OVERRIDES: ReadonlyMap<string, string> = new Map(
  scalarCatalog.flatMap(({ name, example }) =>
    example === undefined ? [] : [[name, JSON.stringify(example)]],
  ),
);

function unwrapNamedTypeName(type: TypeNode): string | null {
  if (type.kind === Kind.NAMED_TYPE) return type.name.value;
  if (type.kind === Kind.NON_NULL_TYPE || type.kind === Kind.LIST_TYPE) {
    return unwrapNamedTypeName(type.type);
  }
  return null;
}

// Top-level Date/DateTime field names across all object types in a state SDL.
export function getDateLikeFieldNames(
  stateSchemaSDL: string | null,
): Set<string> {
  const names = new Set<string>();
  if (!stateSchemaSDL) return names;
  let doc;
  try {
    doc = parse(stateSchemaSDL);
  } catch {
    return names;
  }
  for (const def of doc.definitions) {
    if (def.kind !== Kind.OBJECT_TYPE_DEFINITION) continue;
    for (const field of def.fields ?? []) {
      if (DATE_LIKE_SCALARS.has(unwrapNamedTypeName(field.type) ?? "")) {
        names.add(field.name.value);
      }
    }
  }
  return names;
}

// State-field name -> override literal, for fields whose scalar needs a stricter mock value.
export function getMockOverrideFieldNames(
  stateSchemaSDL: string | null,
): Map<string, string> {
  const overrides = new Map<string, string>();
  if (!stateSchemaSDL) return overrides;
  let doc;
  try {
    doc = parse(stateSchemaSDL);
  } catch {
    return overrides;
  }
  for (const def of doc.definitions) {
    if (def.kind !== Kind.OBJECT_TYPE_DEFINITION) continue;
    for (const field of def.fields ?? []) {
      const literal = SCALAR_MOCK_OVERRIDES.get(
        unwrapNamedTypeName(field.type) ?? "",
      );
      if (literal) overrides.set(field.name.value, literal);
    }
  }
  return overrides;
}

// Field names on the first input type in an operation's SDL.
export function getInputFieldNames(
  operationSDL: string | null,
  // The operation's own input type (e.g. `AddAssistantMessageInput`). An operation SDL may
  // define nested input types too (defined before the main one), so we must select by name,
  // not just take the first — otherwise a nested input's fields leak into the override set.
  preferredInputTypeName?: string,
): string[] {
  if (!operationSDL) return [];
  let doc;
  try {
    doc = parse(operationSDL);
  } catch {
    return [];
  }
  const inputDefs = doc.definitions.filter(
    (d) => d.kind === Kind.INPUT_OBJECT_TYPE_DEFINITION,
  );
  const inputDef =
    (preferredInputTypeName &&
      inputDefs.find((d) => d.name.value === preferredInputTypeName)) ||
    inputDefs[0];
  if (!inputDef || inputDef.kind !== Kind.INPUT_OBJECT_TYPE_DEFINITION) {
    return [];
  }
  return (inputDef.fields ?? []).map((f) => f.name.value);
}

const avoidOptionals: TypeScriptPluginConfig["avoidOptionals"] = {
  field: true,
  inputValue: false,
};
const maybeValue = "T | null | undefined";
const typescriptConfig: TypeScriptPluginConfig = {
  avoidOptionals,
  scalars,
  strictScalars: true,
  enumsAsTypes: true,
  skipTypename: true,
  maybeValue,
};

const validationSchemaConfig: ValidationSchemaPluginConfig = {
  avoidOptionals,
  scalars,
  strictScalars: true,
  enumsAsTypes: true,
  skipTypename: true,
  importFrom: `./types.js`,
  schema: "zodv4",
  useTypeImports: true,
  scalarSchemas: scalarsValidation,
  directives: {
    equals: {
      value: ["regex", "/^$1$/"],
    },
  },
  withObjectType: true,
  maybeValue,
};

async function formatContent(path: string, content: string) {
  const result = await oxfmtFormat(path, content, { printWidth: 80 });
  return result.code;
}

type GenerateTypesAndZodSchemasFromGraphqlArgs = {
  schemaDirPath: string;
  schema: string;
  projectScalars?: ProjectScalars;
};
export async function generateTypesAndZodSchemasFromGraphql(
  args: GenerateTypesAndZodSchemasFromGraphqlArgs,
) {
  const {
    schemaDirPath,
    schema,
    projectScalars = { names: [], importPath: "" },
  } = args;
  const additions = projectScalarCodegenConfig(projectScalars);
  const modelScalars = { ...scalars, ...additions.scalars };
  const modelTypescriptConfig: TypeScriptPluginConfig = {
    ...typescriptConfig,
    scalars: modelScalars,
  };
  const modelValidationSchemaConfig: ValidationSchemaPluginConfig = {
    ...validationSchemaConfig,
    scalars: modelScalars,
    scalarSchemas: { ...scalarsValidation, ...additions.scalarSchemas },
  };

  const config: CodegenConfig = {
    overwrite: true,
    watch: false,
    pluginLoader,
    hooks: {
      beforeOneFileWrite: formatContent,
    },
    generates: {
      [`${schemaDirPath}/types.ts`]: {
        schema,
        config: modelTypescriptConfig,
        plugins: [
          {
            typescript: modelTypescriptConfig,
          },
        ],
      },
      [`${schemaDirPath}/zod.ts`]: {
        schema,
        config: modelValidationSchemaConfig,
        plugins: [
          {
            add: {
              content:
                "/* eslint-disable @typescript-eslint/no-empty-object-type */",
            },
          },
          {
            add: {
              content: "/* eslint-disable @typescript-eslint/no-unused-vars */",
            },
          },
          ...(additions.zodImport
            ? [{ add: { content: additions.zodImport } }]
            : []),
          {
            "graphql-codegen-typescript-validation-schema":
              modelValidationSchemaConfig,
          },
        ],
      },
    },
  };

  await generate(config, true);
}

export async function generateDocumentModelZodSchemas(
  args: DocumentModelFileMakerArgs,
) {
  const { specification, schemaDirPath, versionDirPath, projectDir } = args;

  const schema = buildGraphqlDocumentStringForSpecification(specification);

  await generateTypesAndZodSchemasFromGraphql({
    schemaDirPath,
    schema,
    projectScalars: {
      names: getProjectScalarNames(specification),
      importPath: projectScalarsImportPath(schemaDirPath, projectDir),
    },
  });

  await fs.writeFile(
    path.join(versionDirPath, "schema.graphql"),
    await formatFileText("schema.graphql", schema),
  );
}
