import { type CodegenConfig, generate } from "@graphql-codegen/cli";
import { type TypeScriptPluginConfig } from "@graphql-codegen/typescript";
import {
  generatorTypeDefs,
  validationSchema,
} from "@powerhousedao/document-engineering/graphql";
import { readdirSync } from "node:fs";
import { formatWithPrettierBeforeWrite } from "./utils.js";

const getDirectories = (source: string) =>
  readdirSync(source, { withFileTypes: true })
    .filter((dirent) => dirent.isDirectory())
    .map((dirent) => dirent.name);

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

export const tsConfig: TypeScriptPluginConfig = {
  strictScalars: true,
  scalars,
  enumsAsTypes: true,
  allowEnumStringTypes: true,
  avoidOptionals: {
    field: true,
  },
  skipTypename: true,
  // maybeValue: "T | null | undefined",
  inputMaybeValue: "T | null | undefined",
};

export const zodConfig: Record<string, unknown> = {
  ...tsConfig,
  importFrom: `./types.js`,
  schema: "zod",
  useTypeImports: true,
  scalarSchemas: scalarsValidation,
  directives: {
    equals: {
      value: ["regex", "/^$1$/"],
    },
  },
  withObjectType: true,
} as const;

export function schemaConfig(
  name: string,
  inDir: string,
  outDir: string,
): CodegenConfig["generates"] {
  return {
    [`${outDir}/${name}/gen/schema/types.ts`]: {
      schema: [
        {
          [`${inDir}/${name}/schema.graphql`]: {
            skipGraphQLImport: false,
          },
        },
      ],
      plugins: ["typescript"],
      config: tsConfig,
    },
    [`${outDir}/${name}/gen/schema/zod.ts`]: {
      schema: `${inDir}/${name}/schema.graphql`,
      plugins: ["@acaldas/graphql-codegen-typescript-validation-schema"],
      config: zodConfig,
    },
  };
}

export const generateSchema = (
  model: string,
  inDir: string,
  { watch = false, skipFormat = false, outDir = inDir } = {},
) => {
  const documentModelConfig = schemaConfig(model, inDir, outDir);

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
  inDir: string,
  { watch = false, skipFormat = false, outDir = inDir } = {},
) => {
  const documentModels = getDirectories(inDir);
  const documentModelConfigs = documentModels.reduce(
    (obj, model) => ({
      ...obj,
      ...schemaConfig(model, inDir, outDir),
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
