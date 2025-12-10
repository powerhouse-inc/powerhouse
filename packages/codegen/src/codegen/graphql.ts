import type { CodegenConfig } from "@graphql-codegen/cli";
import { generate } from "@graphql-codegen/cli";
import type { TypeScriptPluginConfig } from "@graphql-codegen/typescript";
import {
  generatorTypeDefs,
  validationSchema,
} from "@powerhousedao/document-engineering/graphql";
import type { DocumentSpecification } from "document-model";
import type { ValidationSchemaPluginConfig } from "graphql-codegen-typescript-validation-schema";
import { readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
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
  scalars,
  strictScalars: true,
  enumsAsTypes: true,
  skipTypename: true,
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
      plugins: ["graphql-codegen-typescript-validation-schema"],
      config: zodConfig,
    },
  };
}

export const generateSchema = async (
  model: string,
  inDir: string,
  { watch = false, skipFormat = false, outDir = inDir, verbose = true } = {},
) => {
  const documentModelConfig = schemaConfig(model, inDir, outDir);

  const config: CodegenConfig = {
    overwrite: true,
    generates: documentModelConfig,
    watch,
    silent: !verbose,
  };

  // GraphQL Codegen hooks are not working reliably - write files manually
  const fs = await import("node:fs");
  const path = await import("node:path");

  const result = (await generate(config, !verbose)) as Array<{
    filename: string;
    content: string;
    hooks: Record<string, unknown>;
  }>;

  for (const fileResult of result) {
    const { filename, content } = fileResult;
    const fullPath = path.resolve(filename);
    const dir = path.dirname(fullPath);

    // Ensure directory exists
    fs.mkdirSync(dir, { recursive: true });

    // Write content (content is already typed as string)
    let finalContent: string = content;

    // Format if not skipped
    if (!skipFormat) {
      try {
        const { format } = await import("prettier");
        finalContent = await format(content, { parser: "typescript" });
      } catch (error) {
        if (verbose) {
          console.warn(`Failed to format ${filename}:`, error);
        }
      }
    }

    fs.writeFileSync(fullPath, finalContent);
  }

  return result;
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
        config: zodConfig,
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
