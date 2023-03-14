import dts from 'rollup-plugin-dts';
import esbuild from 'rollup-plugin-esbuild';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import pkg from './package.json' assert { type: 'json' };

const name = pkg.main.replace(/\.js$/, '');

export default [
    {
        input: 'src/index.ts',
        plugins: [nodeResolve(), esbuild()],
        output: [
            {
                file: `${name}.js`,
                format: 'cjs',
                sourcemap: true,
            },
            {
                file: `${name}.mjs`,
                format: 'es',
                sourcemap: true,
            },
        ],
    },
    {
        input: 'src/index.ts',
        plugins: [nodeResolve(), dts({ respectExternal: true })],
        output: {
            file: `${name}.d.ts`,
            format: 'es',
        },
    },
];
