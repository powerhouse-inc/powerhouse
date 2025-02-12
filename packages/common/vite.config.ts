import path from 'node:path';
import { readdirSync, existsSync } from 'node:fs';
import { defineConfig } from 'vite';
import { InlineConfig } from 'vitest/node';
import dts from 'vite-plugin-dts';
import generateFile from 'vite-plugin-generate-file';
import { getConfig } from '@powerhousedao/config/powerhouse';

const { documentModelsDir, editorsDir } = getConfig();

const entry: Record<string, string> = {
    index: 'index.ts',
    documentModels: path.resolve(documentModelsDir, 'index.ts'),
    editors: path.resolve(editorsDir, 'index.ts'),
};

// add subpackage for each editor
readdirSync(documentModelsDir, { withFileTypes: true })
    .filter((dirent) => dirent.isDirectory())
    .map((dirent) => dirent.name)
    .forEach((name) => {
        entry[name] = path.resolve(documentModelsDir, name, 'index.ts');
    });

readdirSync(editorsDir, { withFileTypes: true })
    .filter((dirent) => dirent.isDirectory())
    .map((dirent) => dirent.name)
    .forEach((name) => {
        const editorPath = path.resolve(editorsDir, name, 'index.ts');
        if (existsSync(editorPath)) {
            entry[`editors/${name}`] = editorPath;
        }
    });

export default defineConfig(() => {
    const external = [
        'react',
        'react/jsx-runtime',
        'react-dom',
        /^document-model\//,
        'document-model-libs',
    ];

    const test: InlineConfig = {
        globals: true,
    };

    return {
        test,
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
                    manualChunks: (id) => {
                        if (
                            id.startsWith(path.join(__dirname, 'editors')) &&
                            /editors\/[^/]+\/editor.tsx/.exec(id)
                        ) {
                            const editorName = path.basename(path.dirname(id));
                            return `editors/${editorName}/editor`;
                        } else if (
                            id.startsWith(
                                path.join(__dirname, 'document-models'),
                            ) &&
                            /document-models\/[^/]+\/index.ts/.exec(id)
                        ) {
                            const modelName = path.basename(path.dirname(id));
                            return `document-models/${modelName}`;
                        } else if (id.includes('lazy-with-preload')) {
                            return 'utils/lazy-with-preload';
                        }
                    },
                    entryFileNames: '[format]/[name].js',
                    chunkFileNames: (info) => {
                        // creates named chunk for editor components, document-models and utils
                        if (info.name.startsWith('editors/')) {
                            return `[format]/${info.name}.js`;
                        } else if (info.name.startsWith('document-models/')) {
                            return `[format]/${info.name}.js`;
                        } else if (info.name.startsWith('utils')) {
                            return `[format]/${info.name}.js`;
                        } else {
                            return '[format]/internal/[name]-[hash].js';
                        }
                    },
                },
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
    };
});
