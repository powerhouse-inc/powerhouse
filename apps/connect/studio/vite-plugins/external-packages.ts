import { getConfig } from '@powerhousedao/config/powerhouse';
import fs from 'node:fs';
import { dirname, join } from 'node:path';
import { normalizePath, PluginOption } from 'vite';
import { viteIgnoreStaticImport, viteReplaceImports } from './base';

// TODO use config path?
const __dirname = join(process.cwd(), '.ph/');
// import.meta.dirname || dirname(fileURLToPath(import.meta.url));

export const EXTERNAL_PACKAGES_IMPORT = 'PH:EXTERNAL_PACKAGES';
export const IMPORT_SCRIPT_FILE = normalizePath(
    join(__dirname, 'external-packages.js'),
);

export function generateImportScript(packages: string[]) {
    const targetDir = dirname(IMPORT_SCRIPT_FILE);
    // create file if it doesn't exist, also create path if it doesn't exist (recursive)
    if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
    }

    const imports: string[] = [];
    const moduleNames: string[] = [];
    let counter = 0;

    for (const packageName of packages) {
        const moduleName = `module${counter}`;
        moduleNames.push(moduleName);
        imports.push(`import * as ${moduleName} from '${packageName}';`);
        counter++;
    }

    const exportStatement = `export default [${moduleNames.join(', ')}];`;

    const fileContent = `${imports.join('\n')}\n\n${exportStatement}`;
    fs.writeFileSync(IMPORT_SCRIPT_FILE, fileContent);

    return IMPORT_SCRIPT_FILE;
}

export const viteLoadExternalPackages = (
    packages: string[] | undefined,
    hmr = false,
): PluginOption => {
    if (!packages?.length && !hmr) {
        return viteIgnoreStaticImport([EXTERNAL_PACKAGES_IMPORT]);
    }

    generateImportScript(packages ?? []);
    process.env.LOAD_EXTERNAL_PACKAGES = 'true';
    return [
        viteReplaceImports({ [EXTERNAL_PACKAGES_IMPORT]: IMPORT_SCRIPT_FILE }),
        hmr && {
            name: 'vite-plugin-studio-external-packages',
            handleHotUpdate({ file, server, modules }) {
                console.log(
                    `[HMR] File changed: ${file}`,
                    modules.map(m => m.id),
                );

                if (file.endsWith('powerhouse.config.json')) {
                    console.log(
                        'External packages file changed, triggering reload...',
                    );
                    const config = getConfig();
                    generateImportScript(
                        config.packages?.map(p => p.packageName) ?? [],
                    );
                    const module =
                        server.moduleGraph.getModuleById(IMPORT_SCRIPT_FILE);

                    if (module) {
                        // server.ws.send({ type: 'full-reload' });
                        server.moduleGraph.invalidateModule(module);
                        return [module].concat(...module.importers.values());
                        // module.importers.forEach(importer => {
                        //     console.log('Invalidating', importer.id);
                        //     server.moduleGraph.invalidateModule(importer);
                        // });
                        // server.moduleGraph.invalidateModule(module);
                    }
                    // return [module, module?.importers]; // Returning an empty array prevents HMR for this file
                } else if (file === IMPORT_SCRIPT_FILE) {
                    console.log('Ignore HMR', IMPORT_SCRIPT_FILE);
                    modules
                        .filter(module => module.id === IMPORT_SCRIPT_FILE)
                        .forEach(module => {
                            server.ws.send('studio:external-packages-updated', {
                                url: module.url,
                                timestamp: module.lastHMRTimestamp,
                            });
                        });
                    return modules;
                }

                return modules;
            },
        },
    ];
};
