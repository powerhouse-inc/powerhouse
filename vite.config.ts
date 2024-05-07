import { getConfig } from '@powerhousedao/codegen';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { resolve } from 'path';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';
import generateFile from 'vite-plugin-generate-file';
import { InlineConfig } from 'vitest';

const { documentModelsDir, editorsDir } = getConfig();

const entry: Record<string, string> = {
    index: 'index.ts',
    'document-models': resolve(documentModelsDir, 'index.ts'),
    utils: resolve(editorsDir, 'utils/index.ts'),
    editors: resolve(editorsDir, 'index.ts'),
};

readdirSync(documentModelsDir, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name)
    .forEach(name => {
        entry[name] = resolve(documentModelsDir, name, 'index.ts');
    });

export default defineConfig(({ mode }) => {
    const external = ['react', 'react/jsx-runtime', 'react-dom', /^document-model\//];

    const test: InlineConfig = {
        globals: true,
    };

    return {
        test,
        resolve: {
            alias: {
                module: './create-require.js',
                path: 'path-browserify',
                crypto: 'crypto-browserify',
                'document-model-libs/utils': resolve(
                    __dirname,
                    './editors/utils',
                ),
            },
        },
        build: {
            outDir: `dist`,
            emptyOutDir: true,
            lib: {
                entry,
                formats: ['es', 'cjs'],
            },
            rollupOptions: {
                external,
                output: {
                    manualChunks: (id, meta) => {
                        if (id.startsWith(path.join(__dirname, 'editors')) && id.match(/editors\/[^\/]+\/editor.tsx/)) {
                            const editorName = path.basename(path.dirname(id));
                            return `editors/${editorName}`;
                        }
                    },
                    entryFileNames: '[format]/[name].js',
                    chunkFileNames: (info) => {
                        // creates named chunk for editor and vendor components
                        if (info.name.startsWith('editors/')) {
                            return `[format]/${info.name}.js`
                        } else {
                            return '[format]/internal/[name]-[hash].js'
                        }
                    }
                }
            },
        },
        plugins: [
            dts({ insertTypesEntry: true, exclude: ['**/*.stories.tsx'] }),
            generateFile([
                {
                    type: 'json',
                    output: './es/package.json',
                    data: {
                        type: 'module',
                    },
                },
                {
                    type: 'json',
                    output: `./cjs/package.json`,
                    data: {
                        type: 'commonjs',
                    },
                },
            ]),
        ],
        define: {
            'process.env.NODE_ENV': JSON.stringify(mode),
            __vite_process_env_NODE_ENV: JSON.stringify(mode),
        },
    };
});
