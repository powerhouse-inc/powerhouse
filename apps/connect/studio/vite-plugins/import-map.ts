import path from 'node:path';
import { PluginOption } from 'vite';

export const HOST_PACKAGES = ['react', 'react-dom'];

export const viteImportMap = (
    imports: string[] = HOST_PACKAGES,
    source = 'node_modules',
): PluginOption => {
    if (source != 'node_modules') {
        throw new Error(`[viteImportMap]: Source "${source}" not supported`);
    }

    let outDir = '';
    return {
        name: 'vite-plugin-import-map',
        config(config) {
            if (!config.build) {
                config.build = {};
            }
            if (!config.build.rollupOptions) {
                config.build.rollupOptions = {};
            }
            if (!Array.isArray(config.build.rollupOptions.external)) {
                config.build.rollupOptions.external = [];
            }

            config.build.rollupOptions.external.push(...HOST_PACKAGES);
        },
        configResolved(config) {
            outDir = path.resolve(config.build.outDir);
        },
        closeBundle() {
            const importsMap = {
                react: 'https://esm.sh/react',
                'react/': 'https://esm.sh/react/',
                'react-dom': 'https://esm.sh/react-dom',
                'react-dom/': 'https://esm.sh/react-dom/',
            };

            for (const importPath of imports) {
                const result = import.meta.resolve('react', outDir);
                console.log(outDir, result);
                if (!result) {
                    throw new Error(
                        `[viteImportMap]: Failed to resolve "${importPath}"`,
                    );
                }
                importsMap[importPath] = result;
            }

            console.log('✅ Imported modules:', importsMap);
        },
    };
};
