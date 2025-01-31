import fs from 'node:fs';
import { join } from 'node:path';
import { normalizePath, PluginOption } from 'vite';
import { replaceImports, viteIgnoreStaticImport } from './vite-plugin';

export const EXTERNAL_PACKAGES_IMPORT = 'PH:EXTERNAL_PACKAGES';
export const IMPORT_SCRIPT_FILE = 'external-packages.js';

function generateImportScript(outputPath: string, packages: string[]) {
    const importScriptFilePath = join(outputPath, IMPORT_SCRIPT_FILE);

    // create file if it doesn't exist, also create path if it doesn't exist (recursive)
    if (!fs.existsSync(outputPath)) {
        fs.mkdirSync(outputPath, { recursive: true });
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
    fs.writeFileSync(importScriptFilePath, fileContent);
    return normalizePath(importScriptFilePath);
}

export const viteLoadExternalPackages = (
    packages: string[] | undefined,
): PluginOption => {
    if (!packages || packages.length === 0) {
        return viteIgnoreStaticImport([EXTERNAL_PACKAGES_IMPORT]);
    }

    const importScriptPath = generateImportScript(process.cwd(), packages);
    process.env.LOAD_EXTERNAL_PACKAGES = 'true';
    return replaceImports({ [EXTERNAL_PACKAGES_IMPORT]: importScriptPath });
};
