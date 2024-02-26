import { codegen as generate } from '@graphql-codegen/core';
import { parse } from 'graphql';
import * as ts from 'typescript';
import { z } from 'zod';

if (typeof window !== 'undefined') {
    // @ts-expect-error polyfill
    window.z = z;
    if (typeof process !== 'undefined') {
        // @ts-expect-error polyfill
        process.hrtime = () => [0, 0];
    } // Fix error - TypeError: process.hrtime is not a function
    window.process = window.process || { hrtime: () => [0, 0] }; // Fix error - TypeError: process.hrtime is not a function
    window.global = window; // type-graphql error - global is not defined
}

export default async function codegen(code: string) {
    const schema = parse(code);
    const typescript = await import('@graphql-codegen/typescript');
    const typescriptValidationSchema = await import(
        '@acaldas/graphql-codegen-typescript-validation-schema'
    );
    let generatedCode = await generate({
        schema,
        filename: 'types.ts',
        documents: [],
        config: {},
        plugins: [
            // Each plugin should be an object
            {
                typescript: {
                    avoidOptionals: {
                        field: true,
                    },
                    maybeValue: 'T',
                }, // Here you can pass configuration to the plugin
            },
            {
                'typescript-validation-schema': {
                    schema: 'zod',
                    withObjectType: true,
                },
            },
        ],
        pluginMap: {
            typescript,
            'typescript-validation-schema': typescriptValidationSchema,
        },
    });
    generatedCode = generatedCode
        .replace("import { z } from 'zod'", '')
        .replace('nullish', 'nullable');

    console.log(generatedCode);

    const output = ts.transpileModule(generatedCode, {
        compilerOptions: { module: ts.ModuleKind.ES2020 },
    });

    return URL.createObjectURL(
        new Blob([String.raw({ raw: output.outputText })], {
            type: 'text/javascript',
        }),
    );
}
