import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

const entry = {
    index: 'index.ts',
};

export default defineConfig(() => {
    const external = [
        'document-model',
        'document-model/document',
        'react',
        'react-dom',
    ];

    return {
        build: {
            outDir: `dist`,
            emptyOutDir: true,
            lib: {
                entry,
                formats: ['es', 'cjs'],
                fileName: (format, entryName) =>
                    `${entryName}.${format === 'cjs' ? 'cjs' : 'js'}`,
            },
            rollupOptions: {
                external,
                output: {
                    exports: 'named',
                },
            },
        },
        plugins: [dts({ insertTypesEntry: true })],
    };
});
