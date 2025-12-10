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
} from "document-model";
import type { ValidationSchemaPluginConfig } from "graphql-codegen-typescript-validation-schema";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const getDirectories = (source: string) =>
  readdirSync(source, { withFileTypes: true })
    .filter((dirent) => dirent.isDirectory())
    .map((dirent) => dirent);

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

const typescriptConfig: TypeScriptPluginConfig = {
  scalars,
  strictScalars: true,
  enumsAsTypes: true,
  skipTypename: true,
};

const validationSchemaConfig: ValidationSchemaPluginConfig = {
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
};

function buildGraphqlDocumentStringForSpecification(
  specification: DocumentSpecification,
) {
  const customScalarSchemas = Object.keys(scalars)
    .map((k) => `scalar ${k}`)
    .join("\n");
  const stateSchemas = Object.values(specification.state).map(
    (state) => state.schema,
  );
  const moduleSchemas = specification.modules
    .flatMap((module) => module.operations.map((operation) => operation.schema))
    .filter((schema) => schema !== null);

  return [customScalarSchemas, ...stateSchemas, ...moduleSchemas];
}

export async function generateTypesAndZodSchemasFromGraphql(
  schema: string,
  dirName: string,
  writeFile = true,
) {
  const config: CodegenConfig = {
    overwrite: true,
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
  documentModelVersionDirPath: string;
  specification: DocumentSpecification;
}) {
  const { documentModelVersionDirPath, specification } = args;
  const schema = buildGraphqlDocumentStringForSpecification(specification)
    .filter(Boolean)
    .join("\n\n");

  await generateTypesAndZodSchemasFromGraphql(
    schema,
    documentModelVersionDirPath,
  );

  writeFileSync(
    path.join(documentModelVersionDirPath, "schema.graphql"),
    schema,
  );
}

export const generateSchemas = async (
  inDir: string,
  { watch = false, skipFormat = false, outDir = inDir } = {},
) => {
  const dirs = getDirectories(inDir);
  const inputs = dirs.map((dir) => {
    const documentModelJsonFile = readFileSync(
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
  });

  await Promise.all(
    inputs.map(async ({ schema, dirName }) => {
      await generateTypesAndZodSchemasFromGraphql(schema, dirName);
    }),
  );
};
