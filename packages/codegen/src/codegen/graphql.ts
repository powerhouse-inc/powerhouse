import type { CodegenConfig } from "@graphql-codegen/cli";
import { generate } from "@graphql-codegen/cli";
import type { TypeScriptPluginConfig } from "@graphql-codegen/typescript";
import {
  generatorTypeDefs,
  validationSchema,
} from "@powerhousedao/document-engineering/graphql";
import type {
  DocumentSpecification,
  ModuleSpecification,
} from "@powerhousedao/shared/document-model";
import type { DocumentModelFileMakerArgs } from "file-builders";
import type { TypeNode } from "graphql";
import { Kind, parse } from "graphql";
import type { ValidationSchemaPluginConfig } from "graphql-codegen-typescript-validation-schema";
import { realpathSync } from "node:fs";
import fs from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { format as oxfmtFormat } from "oxfmt";

/* Resolve graphql-codegen plugins from this package's own install rather than
 * graphql-codegen's default loader. The default resolves relative to graphql-
 * codegen's location and is sensitive to the install layout (which cli copy,
 * cwd), so it can report "Unable to find template plugin matching '<name>'"
 * even when the plugins are installed. This package depends on its plugins
 * directly, so resolving from here is deterministic. (selfReal covers
 * --preserve-symlinks, where import.meta.url is the symlink path.) graphql-
 * codegen probes candidate names; unresolved ones throw MODULE_NOT_FOUND so it
 * falls through to the next candidate. */
type PluginLoader = NonNullable<CodegenConfig["pluginLoader"]>;
type CodegenPlugin = Awaited<ReturnType<PluginLoader>>;
function makePluginLoader(): PluginLoader {
  const selfPath = fileURLToPath(import.meta.url);
  let selfReal = selfPath;
  try {
    selfReal = realpathSync(selfPath);
  } catch {
    // keep selfPath
  }
  const requirers = [createRequire(selfPath), createRequire(selfReal)];
  return async (name: string) => {
    let lastErr: unknown;
    for (const requireFrom of requirers) {
      try {
        return (await import(
          pathToFileURL(requireFrom.resolve(name)).href
        )) as CodegenPlugin;
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr;
  };
}

const pluginLoader = makePluginLoader();

export const scalars = {
  Unknown: "unknown",
  DateTime: "string",
  Address: "`${string}:0x${string}`",
  AttachmentRef: "`attachment://v${number}:${string}`",
  ...(generatorTypeDefs as Record<string, string>),
};

export const scalarsValidation = {
  Unknown: "z.unknown()",
  DateTime: "z.string().datetime()",
  Address:
    "z.custom<`${string}:0x${string}`>((val) => /^[a-zA-Z0-9]+:0x[a-fA-F0-9]{40}$/.test(val as string))",
  AttachmentRef:
    "z.custom<`attachment://v${number}:${string}`>((val) => /^attachment:\\/\\/v\\d+:.+$/.test(val as string))",
  ...(validationSchema as Record<string, string>),
};

// Scalars codegen validates with strict `z.iso.datetime()`.
const DATE_LIKE_SCALARS = new Set(["Date", "DateTime"]);

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

// Field names on the first input type in an operation's SDL.
export function getInputFieldNames(operationSDL: string | null): string[] {
  if (!operationSDL) return [];
  let doc;
  try {
    doc = parse(operationSDL);
  } catch {
    return [];
  }
  const inputDef = doc.definitions.find(
    (d) => d.kind === Kind.INPUT_OBJECT_TYPE_DEFINITION,
  );
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

function buildSchemasForModules(modules: ModuleSpecification[]) {
  const schemaStrings: string[] = [];
  for (const module of modules) {
    schemaStrings.push(`# ${module.name}`);
    const operationsSchemas = module.operations
      .map((operation) => operation.schema)
      .filter((schema) => schema !== null);
    schemaStrings.push(...operationsSchemas);
  }
  return schemaStrings;
}

function buildGraphqlDocumentStringForSpecification(
  specification: DocumentSpecification,
) {
  const customScalarSchemas = Object.keys(scalars)
    .map((k) => `scalar ${k}`)
    .join("\n");
  const stateSchemas = Object.values(specification.state).map(
    (state) => state.schema,
  );
  const moduleSchemas = buildSchemasForModules(specification.modules);

  return [customScalarSchemas, ...stateSchemas, ...moduleSchemas];
}

async function formatContent(path: string, content: string) {
  const result = await oxfmtFormat(path, content, { printWidth: 80 });
  return result.code;
}

type GenerateTypesAndZodSchemasFromGraphqlArgs = {
  schemaDirPath: string;
  schema: string;
};
export async function generateTypesAndZodSchemasFromGraphql(
  args: GenerateTypesAndZodSchemasFromGraphqlArgs,
) {
  const { schemaDirPath, schema } = args;

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
        config: typescriptConfig,
        plugins: [
          {
            typescript: typescriptConfig,
          },
        ],
      },
      [`${schemaDirPath}/zod.ts`]: {
        schema,
        config: validationSchemaConfig,
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
          {
            "graphql-codegen-typescript-validation-schema":
              validationSchemaConfig,
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
  const { specification, schemaDirPath, versionDirPath } = args;

  const schema = buildGraphqlDocumentStringForSpecification(specification)
    .filter(Boolean)
    .join("\n\n");

  await generateTypesAndZodSchemasFromGraphql({
    schemaDirPath,
    schema,
  });

  await fs.writeFile(path.join(versionDirPath, "schema.graphql"), schema);
}
