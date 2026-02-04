import type { CodegenConfig } from "@graphql-codegen/cli";
import { generate } from "@graphql-codegen/cli";
import type { TypeScriptPluginConfig } from "@graphql-codegen/typescript";
import {
  generatorTypeDefs,
  validationSchema,
} from "@powerhousedao/document-engineering/graphql";
import type {
  DocumentModelGlobalState,
  DocumentSpecification,
  ModuleSpecification,
} from "document-model";
import type { ValidationSchemaPluginConfig } from "graphql-codegen-typescript-validation-schema";
import fs from "node:fs/promises";
import path from "node:path";
import { format } from "prettier";

const getDirectories = async (source: string) => {
  const dir = await fs.readdir(source, { withFileTypes: true });
  return dir.filter((dirent) => dirent.isDirectory()).map((dirent) => dirent);
};

export const scalars = {
  Unknown: "unknown",
  DateTime: "string",
  Attachment: "string",
  Address: "`${string}:0x${string}`",
  ...(generatorTypeDefs as Record<string, string>),
};

export const scalarsValidation = {
  Unknown: "z.unknown()",
  DateTime: "z.string().datetime()",
  Attachment: "z.string()",
  Address:
    "z.custom<`${string}:0x${string}`>((val) => /^[a-zA-Z0-9]+:0x[a-fA-F0-9]{40}$/.test(val as string))",
  ...(validationSchema as Record<string, string>),
};

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

async function formatContentWithPrettier(path: string, content: string) {
  const formattedContent = await format(content, {
    parser: "typescript",
  });
  return formattedContent;
}

type GenerateTypesAndZodSchemasFromGraphqlArgs = {
  dirName: string;
  schema: string;
  skipFormat?: boolean;
  writeFile?: boolean;
  watch?: boolean;
};
export async function generateTypesAndZodSchemasFromGraphql(
  args: GenerateTypesAndZodSchemasFromGraphqlArgs,
) {
  const { dirName, schema, skipFormat, writeFile, watch } = args;
  const beforeOneFileWrite = skipFormat ? undefined : formatContentWithPrettier;

  const config: CodegenConfig = {
    overwrite: true,
    watch,
    hooks: {
      beforeOneFileWrite,
    },
    generates: {
      [`${dirName}/gen/schema/types.ts`]: {
        schema,
        config: typescriptConfig,
        plugins: [
          {
            typescript: typescriptConfig,
          },
        ],
      },
      [`${dirName}/gen/schema/zod.ts`]: {
        schema,
        config: validationSchemaConfig,
        plugins: [
          {
            "graphql-codegen-typescript-validation-schema":
              validationSchemaConfig,
          },
        ],
      },
    },
  };

  await generate(config, writeFile);
}

export async function generateDocumentModelZodSchemas(args: {
  documentModelDirPath: string;
  specification: DocumentSpecification;
  writeFile?: boolean;
  skipFormat?: boolean;
  watch?: boolean;
}) {
  const {
    documentModelDirPath,
    specification,
    writeFile = true,
    skipFormat = false,
    watch = false,
  } = args;
  const schema = buildGraphqlDocumentStringForSpecification(specification)
    .filter(Boolean)
    .join("\n\n");

  await generateTypesAndZodSchemasFromGraphql({
    dirName: documentModelDirPath,
    schema,
    writeFile,
    skipFormat,
    watch,
  });

  await fs.writeFile(path.join(documentModelDirPath, "schema.graphql"), schema);
}

export const generateSchemas = async (
  inDir: string,
  { watch = false, skipFormat = false, writeFile = true, outDir = inDir } = {},
) => {
  const dirs = await getDirectories(inDir);
  const inputs = await Promise.all(
    dirs.map(async (dir) => {
      const documentModelJsonFile = await fs.readFile(
        path.join(dir.parentPath, dir.name, `${dir.name}.json`),
        "utf-8",
      );
      const parsedJson = JSON.parse(
        documentModelJsonFile,
      ) as DocumentModelGlobalState;

      const latestSpecification =
        parsedJson.specifications[parsedJson.specifications.length - 1];

      const schema = buildGraphqlDocumentStringForSpecification(
        latestSpecification,
      )
        .filter(Boolean)
        .join("\n\n");

      return { dirName: path.join(outDir, dir.name), schema };
    }),
  );

  await Promise.all(
    inputs.map(async ({ schema, dirName }) => {
      await generateTypesAndZodSchemasFromGraphql({
        schema,
        dirName,
        writeFile,
        skipFormat,
        watch,
      });
    }),
  );
};
