import { type CodegenConfig, generate } from '@graphql-codegen/cli';
import { readdirSync } from 'fs';

const getDirectories = (source: string) =>
    readdirSync(source, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name);

const SCHEMAS_DIR = './schemas';
const TARGET_DIR = './document-models';

const tsConfig = {
    strict: true,
    strictScalars: true,
    scalars: {
        Unknown: 'unknown',
        DateTime: 'string',
        Attachment: 'string',
        Address: '`${string}:0x${string}`',
    },
    enumsAsTypes: true,
    allowEnumStringTypes: true,
    avoidOptionals: {
        field: true,
    },
    useIndexSignature: true,
    noSchemaStitching: true,
    skipTypename: false,
    // maybeValue: "T | null | undefined",
    inputMaybeValue: 'T | null | undefined',
};

function schemaConfig(
    name: string,
    schemasDir: string,
    targetDir: string,
): CodegenConfig['generates'] {
    return {
        [`${targetDir}/${name}/gen/schema/types.ts`]: {
            schema: [
                {
                    [`${schemasDir}/${name}/index.graphql`]: {
                        skipGraphQLImport: false,
                    },
                },
            ],
            plugins: ['typescript'],
            config: tsConfig,
        },
        [`${targetDir}/${name}/gen/schema/zod.ts`]: {
            schema: `${schemasDir}/${name}/index.graphql`,
            plugins: ['@acaldas/graphql-codegen-typescript-validation-schema'],
            config: {
                importFrom: `./types`,
                schema: 'zod',
                ...tsConfig,
                scalarSchemas: {
                    Unknown: 'z.unknown()',
                    DateTime: 'z.string().datetime()',
                    Attachment: 'z.string()',
                    Address:
                        'z.custom<`${string}:0x${string}`>((val) => /^[a-zA-Z0-9]+:0x[a-fA-F0-9]{40}$/.test(val as string))',
                },
                directives: {
                    equals: {
                        value: ['regex', '/^$1$/'],
                    },
                },
                withObjectType: true,
            },
        },
    };
}

export const executeAll = (
    schemasDir = SCHEMAS_DIR,
    targetDir = TARGET_DIR,
) => {
    const documentModels = getDirectories(schemasDir);
    const documentModelConfigs = documentModels.reduce(
        (obj, model) => ({
            ...obj,
            ...schemaConfig(model, schemasDir, targetDir),
        }),
        {},
    );

    const config: CodegenConfig = {
        overwrite: true,
        generates: documentModelConfigs,
    };
    return generate(config, true);
};
