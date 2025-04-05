import { type CodegenConfig, generate } from "@graphql-codegen/cli";
import { type TypeScriptPluginConfig } from "@graphql-codegen/typescript";
import { generatorTypeDefs, validationSchema } from "@powerhousedao/scalars";
import { readdirSync } from "node:fs";
import { formatWithPrettierBeforeWrite } from "./utils.js";

const getDirectories = (source: string) =>
  readdirSync(source, { withFileTypes: true })
    .filter((dirent) => dirent.isDirectory())
    .map((dirent) => dirent.name);

export const tsConfig: TypeScriptPluginConfig = {
  strictScalars: true,
  scalars: {
    Unknown: "unknown",
    DateTime: "string",
    Attachment: "string",
    Address: "`${string}:0x${string}`",
    ...(generatorTypeDefs as Record<string, string>),
  },
  enumsAsTypes: true,
  allowEnumStringTypes: true,
  avoidOptionals: {
    field: true,
  },
  skipTypename: true,
  // maybeValue: "T | null | undefined",
  inputMaybeValue: "T | null | undefined",
};

export function schemaConfig(
  name: string,
  dir: string,
): CodegenConfig["generates"] {
  return {
    [`${dir}/${name}/gen/schema/types.ts`]: {
      schema: [
        {
          [`${dir}/${name}/schema.graphql`]: {
            skipGraphQLImport: false,
          },
        },
      ],
      plugins: ["typescript"],
      config: tsConfig,
    },
    [`${dir}/${name}/gen/schema/zod.ts`]: {
      schema: `${dir}/${name}/schema.graphql`,
      plugins: ["@acaldas/graphql-codegen-typescript-validation-schema"],
      config: {
        ...tsConfig,
        importFrom: `./types.js`,
        schema: "zod",
        useTypeImports: true,
        scalarSchemas: {
          Unknown: "z.unknown()",
          DateTime: "z.string().datetime()",
          Attachment: "z.string()",
          Address:
            "z.custom<`${string}:0x${string}`>((val) => /^[a-zA-Z0-9]+:0x[a-fA-F0-9]{40}$/.test(val as string))",
          ...(validationSchema as Record<string, string>),
        },
        directives: {
          equals: {
            value: ["regex", "/^$1$/"],
          },
        },
        withObjectType: true,
      },
    },
  };
}

export const generateSchema = (
  model: string,
  dir: string,
  { watch = false, skipFormat = false } = {},
) => {
  const documentModelConfig = schemaConfig(model, dir);

  const config: CodegenConfig = {
    overwrite: true,
    generates: documentModelConfig,
    watch,
    hooks: {
      beforeOneFileWrite: skipFormat ? [] : [formatWithPrettierBeforeWrite],
    },
  };
  return generate(config, true);
};

export const generateSchemas = (
  dir: string,
  { watch = false, skipFormat = false } = {},
) => {
  const documentModels = getDirectories(dir);
  const documentModelConfigs = documentModels.reduce(
    (obj, model) => ({
      ...obj,
      ...schemaConfig(model, dir),
    }),
    {},
  );

  const config: CodegenConfig = {
    overwrite: true,
    generates: documentModelConfigs,
    watch,
    hooks: {
      beforeOneFileWrite: skipFormat ? [] : [formatWithPrettierBeforeWrite],
    },
  };
  return generate(config, true);
};
