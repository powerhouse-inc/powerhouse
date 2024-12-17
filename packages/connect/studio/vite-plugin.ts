import fs from 'node:fs';
import path from 'node:path';
import {
    Alias,
    AliasOptions,
    Plugin,
    PluginOption,
    ViteDevServer,
    normalizePath,
} from 'vite';

// matches react, react-dom, and all it's sub-imports like react-dom/client
export const externalIds = /^react(-dom)?(\/.*)?$/;
// used to find react imports in the code for text replacement
export const externalImports = /react(-dom)?/;

export const LOCAL_DOCUMENT_MODELS_IMPORT = 'LOCAL_DOCUMENT_MODELS';
export const LOCAL_DOCUMENT_EDITORS_IMPORT = 'LOCAL_DOCUMENT_EDITORS';

export function getStudioConfig(env?: Record<string, string>): {
    [LOCAL_DOCUMENT_MODELS_IMPORT]?: string;
    [LOCAL_DOCUMENT_EDITORS_IMPORT]?: string;
} {
    const config: Record<string, string> = {};

    const LOCAL_DOCUMENT_MODELS =
        process.env.LOCAL_DOCUMENT_MODELS ?? env?.LOCAL_DOCUMENT_MODELS;
    const LOCAL_DOCUMENT_EDITORS =
        process.env.LOCAL_DOCUMENT_EDITORS ?? env?.LOCAL_DOCUMENT_EDITORS;

    const LOCAL_DOCUMENT_MODELS_PATH = LOCAL_DOCUMENT_MODELS
        ? path.resolve(process.cwd(), LOCAL_DOCUMENT_MODELS)
        : undefined;
    const LOCAL_DOCUMENT_EDITORS_PATH = LOCAL_DOCUMENT_EDITORS
        ? path.resolve(process.cwd(), LOCAL_DOCUMENT_EDITORS)
        : undefined;

    if (LOCAL_DOCUMENT_MODELS_PATH) {
        config[LOCAL_DOCUMENT_MODELS_IMPORT] = normalizePath(
            LOCAL_DOCUMENT_MODELS_PATH,
        );
    }
    if (LOCAL_DOCUMENT_EDITORS_PATH) {
        config[LOCAL_DOCUMENT_EDITORS_IMPORT] = normalizePath(
            LOCAL_DOCUMENT_EDITORS_PATH,
        );
    }

    return config;
}

export function watchLocalFiles(
    server: ViteDevServer,
    documentModelsPath?: string,
    editorsPath?: string,
) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const debounce = (callback: () => unknown, delay = 100) => {
        let timeout: NodeJS.Timeout | undefined;
        return function () {
            clearTimeout(timeout);
            timeout = setTimeout(() => {
                callback();
            }, delay);
        };
    };

    const refreshModelsWithDebounce = debounce(() => {
        console.log(`Local document models changed, reloading Connect...`);
        server.ws.send({
            type: 'full-reload',
            path: '*',
        });
    });

    const refreshEditorsWithDebounce = debounce(() => {
        console.log(`Local document editors changed, reloading Connect...`);
        server.ws.send({
            type: 'full-reload',
            path: '*',
        });
    });

    if (documentModelsPath) {
        // Use fs to watch the file and trigger a server reload when it changes
        console.log(
            `Watching local document models at '${documentModelsPath}'...`,
        );
        try {
            fs.watch(
                documentModelsPath,
                {
                    recursive: true,
                },
                (event, filename) => {
                    refreshModelsWithDebounce();
                },
            );
        } catch (e) {
            console.error('Error watching local document models', e);
        }
    }

    if (editorsPath) {
        console.log(`Watching local document editors at '${editorsPath}'...`);
        try {
            fs.watch(
                editorsPath,
                {
                    recursive: true,
                },
                (event, filename) => {
                    refreshEditorsWithDebounce();
                },
            );
        } catch (e) {
            console.error('Error watching local document models', e);
        }
    }
}

// https://github.com/vitejs/vite/issues/6393#issuecomment-1006819717
// vite dev server doesn't support setting dependencies as external
// as when building the app.
function viteIgnoreStaticImport(importKeys: (string | RegExp)[]): Plugin {
    return {
        name: 'vite-plugin-ignore-static-import',
        enforce: 'pre',
        // vite will still append /@id/ to an external import
        // so this will rewrite the 'vite:import-analysis' prefix
        configResolved(resolvedConfig) {
            const values = importKeys.map(key =>
                typeof key === 'string' ? key : key.source,
            );
            const reg = new RegExp(
                `("|')\\/@id\\/(${values.join('|')})(\\/[^"'\\\\]*)?\\1`,
                'g',
            );

            (resolvedConfig.plugins as Plugin[]).push({
                name: 'vite-plugin-ignore-static-import-replace-idprefix',
                transform: code => {
                    const matches = code.matchAll(reg);
                    for (const match of matches) {
                        code = code.replaceAll(
                            match[0],
                            match[0].replace('/@id/', ''),
                        );
                    }
                    return code;
                },
            });
        },
        // prevents the external import from being transformed to 'node_modules/...'
        resolveId: id => {
            if (
                importKeys.some(key =>
                    typeof key === 'string' ? key === id : key.test(id),
                )
            ) {
                return { id, external: true };
            }
        },
        // returns empty string to prevent "Pre-transform error: Failed to load url"
        load(id) {
            if (
                importKeys.some(key =>
                    typeof key === 'string' ? key === id : key.test(id),
                )
            ) {
                return '';
            }
        },
    };
}

export function viteConnectDevStudioPlugin(
    enabled = false,
    env?: Record<string, string>,
): PluginOption[] {
    const studioConfig = getStudioConfig(env);
    const importKeys = [
        LOCAL_DOCUMENT_MODELS_IMPORT,
        LOCAL_DOCUMENT_EDITORS_IMPORT,
    ];
    const localDocumentModelsPath = studioConfig[LOCAL_DOCUMENT_MODELS_IMPORT];
    const localDocumentEditorsPath =
        studioConfig[LOCAL_DOCUMENT_EDITORS_IMPORT];

    return [
        enabled &&
            viteIgnoreStaticImport([
                'react',
                'react-dom',
                '@powerhousedao/scalars',
                '@powerhousedao/design-system',
            ]),
        {
            name: 'vite-plugin-connect-dev-studio',
            enforce: 'pre',
            config(config) {
                if (!localDocumentModelsPath && !localDocumentEditorsPath) {
                    return;
                }

                // adds the provided paths to be resolved by vite
                const resolve = config.resolve ?? {};
                const alias = resolve.alias;
                let resolvedAlias: AliasOptions | undefined;
                if (Array.isArray(alias)) {
                    const arrayAlias = [...(alias as Alias[])];

                    if (localDocumentModelsPath) {
                        arrayAlias.push({
                            find: LOCAL_DOCUMENT_MODELS_IMPORT,
                            replacement: localDocumentModelsPath,
                        });
                    }

                    if (localDocumentEditorsPath) {
                        arrayAlias.push({
                            find: LOCAL_DOCUMENT_EDITORS_IMPORT,
                            replacement: localDocumentEditorsPath,
                        });
                    }
                    resolvedAlias = arrayAlias;
                } else if (typeof alias === 'object') {
                    resolvedAlias = { ...alias, ...studioConfig };
                } else if (typeof alias === 'undefined') {
                    resolvedAlias = { ...studioConfig };
                } else {
                    console.error('resolve.alias was not recognized');
                }

                if (resolvedAlias) {
                    resolve.alias = resolvedAlias;
                    config.resolve = resolve;
                }
            },
            configureServer(server) {
                watchLocalFiles(
                    server,
                    localDocumentModelsPath,
                    localDocumentEditorsPath,
                );
            },
            resolveId: id => {
                // if the path was not provided then declares the local
                // imports as external so that vite ignores them
                if (importKeys.includes(id)) {
                    return {
                        id,
                        external: true,
                    };
                }
            },
        },
    ];
}
