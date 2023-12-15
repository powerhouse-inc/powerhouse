import { type CodegenConfig, generate } from '@graphql-codegen/cli';
import { readdirSync } from 'fs';

const getDirectories = (source: string) =>
    readdirSync(source, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name);

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
    skipTypename: true,
    // maybeValue: "T | null | undefined",
    inputMaybeValue: 'T | null | undefined',
};

function schemaConfig(name: string, dir: string): CodegenConfig['generates'] {
    return {
        [`${dir}/${name}/gen/schema/types.ts`]: {
            schema: [
                {
                    [`${dir}/${name}/schema.graphql`]: {
                        skipGraphQLImport: false,
                    },
                },
            ],
            plugins: ['typescript'],
            config: tsConfig,
        },
        [`${dir}/${name}/gen/schema/zod.ts`]: {
            schema: `${dir}/${name}/schema.graphql`,
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

export const generateSchema = (
    model: string,
    dir: string,
    { watch = false, format = false } = {},
) => {
    const documentModelConfig = schemaConfig(model, dir);
    const config: CodegenConfig = {
        overwrite: true,
        generates: documentModelConfig,
        watch,
        hooks: {
            afterOneFileWrite: format ? ['prettier --ignore-path --write'] : [],
        },
    };
    return generate(config, true);
};

export const generateSchemas = (
    dir: string,
    { watch = false, format = false } = {},
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
            afterOneFileWrite: format ? ['prettier --ignore-path --write'] : [],
        },
    };
    return generate(config, true);
};
