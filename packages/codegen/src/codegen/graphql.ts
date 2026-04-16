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
import type { ValidationSchemaPluginConfig } from "graphql-codegen-typescript-validation-schema";
import fs from "node:fs/promises";
import path from "node:path";
import { format } from "prettier";

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
  documentModelDirPath: string;
  schema: string;
};
export async function generateTypesAndZodSchemasFromGraphql(
  args: GenerateTypesAndZodSchemasFromGraphqlArgs,
) {
  const { documentModelDirPath, schema } = args;

  const config: CodegenConfig = {
    overwrite: true,
    watch: false,
    hooks: {
      beforeOneFileWrite: formatContentWithPrettier,
    },
    generates: {
      [`${documentModelDirPath}/gen/schema/types.ts`]: {
        schema,
        config: typescriptConfig,
        plugins: [
          {
            typescript: typescriptConfig,
          },
        ],
      },
      [`${documentModelDirPath}/gen/schema/zod.ts`]: {
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
            "graphql-codegen-typescript-validation-schema":
              validationSchemaConfig,
          },
        ],
      },
    },
  };

  await generate(config, true);
}

export async function generateDocumentModelZodSchemas(args: {
  documentModelDirPath: string;
  specification: DocumentSpecification;
}) {
  const { documentModelDirPath, specification } = args;
  const schema = buildGraphqlDocumentStringForSpecification(specification)
    .filter(Boolean)
    .join("\n\n");

  await generateTypesAndZodSchemasFromGraphql({
    documentModelDirPath,
    schema,
  });

  await fs.writeFile(path.join(documentModelDirPath, "schema.graphql"), schema);
}
