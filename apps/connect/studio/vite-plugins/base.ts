import MagicString from 'magic-string';
import path from 'node:path';
import { Alias, AliasOptions, Plugin, PluginOption, normalizePath } from 'vite';

// matches react, react-dom, and all it's sub-imports like react-dom/client
export const externalIds = /^react(-dom)?(\/.*)?$/;
// used to find react imports in the code for text replacement
export const externalImports = /react(-dom)?/;

export const LOCAL_DOCUMENT_MODELS_IMPORT = 'LOCAL_DOCUMENT_MODELS';
export const LOCAL_DOCUMENT_EDITORS_IMPORT = 'LOCAL_DOCUMENT_EDITORS';
export const HMR_MODULE_IMPORT = 'PH:HMR_MODULE';

export const STUDIO_IMPORTS = [
    LOCAL_DOCUMENT_MODELS_IMPORT,
    LOCAL_DOCUMENT_EDITORS_IMPORT,
    HMR_MODULE_IMPORT,
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

export function viteReplaceImports(
    imports: Record<string, string>,
): PluginOption {
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
