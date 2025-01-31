import MagicString from 'magic-string';
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

export const STUDIO_IMPORTS = [
    LOCAL_DOCUMENT_MODELS_IMPORT,
    LOCAL_DOCUMENT_EDITORS_IMPORT,
] as const;

export function getStudioConfig(env?: Record<string, string>): {
    [LOCAL_DOCUMENT_MODELS_IMPORT]?: string;
    [LOCAL_DOCUMENT_EDITORS_IMPORT]?: string;
    LOAD_EXTERNAL_PACKAGES?: string;
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
    if (typeof process.env.LOAD_EXTERNAL_PACKAGES !== 'undefined') {
        config.LOAD_EXTERNAL_PACKAGES = process.env.LOAD_EXTERNAL_PACKAGES;
    }

    return config;
}

export function watchLocalFiles(
    server: ViteDevServer,
    documentModelsPath?: string,
    editorsPath?: string,
) {
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
export function viteIgnoreStaticImport(
    _importKeys: (string | RegExp | false | undefined)[],
): Plugin {
    const importKeys = _importKeys.filter(
        key => typeof key === 'string' || key instanceof RegExp,
    );
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
                    const s = new MagicString(code);
                    const matches = code.matchAll(reg);
                    let modified = false;

                    for (const match of matches) {
                        s.overwrite(
                            match.index,
                            match.index + match[0].length,
                            match[0].replace('/@id/', ''),
                        );
                        modified = true;
                    }

                    if (!modified) return null;

                    return {
                        code: s.toString(),
                        map: s.generateMap({ hires: true }), // Generate an accurate source map
                    };
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

export function replaceImports(imports: Record<string, string>): PluginOption {
    const importKeys = Object.keys(imports);
    return {
        name: 'vite-plugin-connect-replace-imports',
        enforce: 'pre',
        config(config) {
            // adds the provided paths to be resolved by vite
            const resolve = config.resolve ?? {};
            const alias = resolve.alias;
            let resolvedAlias: AliasOptions | undefined;
            if (Array.isArray(alias)) {
                const arrayAlias = [...(alias as Alias[])];

                arrayAlias.push(
                    ...Object.entries(imports).map(([find, replacement]) => ({
                        find,
                        replacement,
                    })),
                );

                resolvedAlias = arrayAlias;
            } else if (typeof alias === 'object') {
                resolvedAlias = {
                    ...alias,
                    ...imports,
                };
            } else if (typeof alias === 'undefined') {
                resolvedAlias = { ...imports };
            } else {
                console.error('resolve.alias was not recognized');
            }

            if (resolvedAlias) {
                resolve.alias = resolvedAlias;
                config.resolve = resolve;
            }
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
    };
}

export function viteConnectDevStudioPlugin(
    enabled = false,
    env?: Record<string, string>,
): PluginOption[] {
    const studioConfig = getStudioConfig(env);
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
        localDocumentModelsPath
            ? replaceImports({
                  [LOCAL_DOCUMENT_MODELS_IMPORT]: localDocumentModelsPath,
              })
            : viteIgnoreStaticImport([LOCAL_DOCUMENT_MODELS_IMPORT]),
        localDocumentEditorsPath
            ? replaceImports({
                  [LOCAL_DOCUMENT_EDITORS_IMPORT]: localDocumentEditorsPath,
              })
            : viteIgnoreStaticImport([LOCAL_DOCUMENT_EDITORS_IMPORT]),
        {
            name: 'vite-plugin-connect-dev-studio',
            enforce: 'pre',
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

                const buildStudioExternals = enabled
                    ? [
                          externalIds,
                          ...STUDIO_IMPORTS,
                          '@powerhousedao/studio',
                          '@powerhousedao/design-system',
                          'document-model-libs',
                      ]
                    : [externalIds, ...STUDIO_IMPORTS];

                config.build.rollupOptions.external.push(
                    ...buildStudioExternals,
                );
            },
            configureServer(server) {
                watchLocalFiles(
                    server,
                    localDocumentModelsPath,
                    localDocumentEditorsPath,
                );
            },
        },
    ];
}
