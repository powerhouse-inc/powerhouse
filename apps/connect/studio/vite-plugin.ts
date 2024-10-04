import fs from 'node:fs';
import path from 'node:path';
import {
    Alias,
    AliasOptions,
    Plugin,
    ViteDevServer,
    normalizePath,
} from 'vite';

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
                    console.log(
                        `Local document models changed, reloading server...`,
                    );
                    server.ws.send({
                        type: 'full-reload',
                        path: '*',
                    });
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
                    console.log(
                        `Local document models changed, reloading server...`,
                    );
                    server.ws.send({
                        type: 'full-reload',
                        path: '*',
                    });
                },
            );
        } catch (e) {
            console.error('Error watching local document models', e);
        }
    }
}

export function viteConnectDevStudioPlugin(
    env?: Record<string, string>,
): Plugin {
    const studioConfig = getStudioConfig(env);
    const importKeys = [
        LOCAL_DOCUMENT_MODELS_IMPORT,
        LOCAL_DOCUMENT_EDITORS_IMPORT,
    ];
    const localDocumentModelsPath = studioConfig[LOCAL_DOCUMENT_MODELS_IMPORT];
    const localDocumentEditorsPath =
        studioConfig[LOCAL_DOCUMENT_EDITORS_IMPORT];

    return {
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
    };
}
