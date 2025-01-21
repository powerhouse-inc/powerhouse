import { exec } from 'node:child_process';
import fs from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLogger, createServer, InlineConfig, Plugin } from 'vite';
import { viteEnvs } from 'vite-envs';
import { backupIndexHtml, removeBase64EnvValues } from './helpers';
import {
    getStudioConfig,
    viteConnectDevStudioPlugin,
    viteLoadExternalProjects,
} from './vite-plugin';

export type StartServerOptions = {
    projectsImportPath?: string;
    enableExternalProjects?: boolean;
};

const studioDirname = fileURLToPath(new URL('.', import.meta.url));
const appPath = join(studioDirname, '..');
const viteEnvsScript = join(appPath, 'vite-envs.sh');

const projectRoot = process.cwd();

// silences dynamic import warnings
const logger = createLogger();
// eslint-disable-next-line @typescript-eslint/unbound-method
const loggerWarn = logger.warn;
/**
 * @param {string} msg
 * @param {import('vite').LogOptions} options
 */
logger.warn = (msg, options) => {
    if (msg.includes('The above dynamic import cannot be analyzed by Vite.')) {
        return;
    }
    loggerWarn(msg, options);
};

function ensureNodeVersion(minVersion = '20') {
    const version = process.versions.node;
    if (!version) {
        return;
    }

    if (version < minVersion) {
        console.error(
            `Node version ${minVersion} or higher is required. Current version: ${version}`,
        );
        process.exit(1);
    }
}

function runShellScriptPlugin(scriptPath: string): Plugin {
    return {
        name: 'vite-plugin-run-shell-script',
        buildStart() {
            if (fs.existsSync(scriptPath)) {
                exec(`sh ${scriptPath}`, (error, stdout, stderr) => {
                    if (error) {
                        console.error(
                            `Error executing the script: ${error.message}`,
                        );
                        removeBase64EnvValues();
                        return;
                    }
                    if (stderr) {
                        console.error(stderr);
                    }
                });
            }
        },
    };
}

export async function startServer(options: StartServerOptions = {}) {
    const { enableExternalProjects = true } = options;

    // exits if node version is not compatible
    ensureNodeVersion();

    // backups index html if running on windows
    backupIndexHtml(true);

    const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

    const OPEN_BROWSER =
        typeof process.env.OPEN_BROWSER === 'string'
            ? process.env.OPEN_BROWSER === 'true'
            : true;
    const studioConfig = getStudioConfig();

    // needed for viteEnvs
    if (!fs.existsSync(join(appPath, 'src'))) {
        fs.mkdirSync(join(appPath, 'src'));
    }

    process.env.PH_CONNECT_STUDIO_MODE = 'true';

    const config: InlineConfig = {
        customLogger: logger,
        configFile: false,
        root: appPath,
        server: {
            port: PORT,
            open: OPEN_BROWSER,
            host: Boolean(process.env.HOST),
        },
        resolve: {
            alias: {
                // Resolve to the node_modules in the project root
                '@powerhousedao/design-system/scalars': join(
                    projectRoot,
                    'node_modules',
                    '@powerhousedao',
                    'design-system',
                    'dist',
                    'scalars',
                ),
                '@powerhousedao/design-system': join(
                    projectRoot,
                    'node_modules',
                    '@powerhousedao',
                    'design-system',
                ),
                '@powerhousedao/scalars': join(
                    projectRoot,
                    'node_modules',
                    '@powerhousedao',
                    'scalars',
                ),
                'document-model-libs': join(
                    projectRoot,
                    'node_modules',
                    'document-model-libs',
                ),
                react: join(projectRoot, 'node_modules', 'react'),
                'react-dom': join(projectRoot, 'node_modules', 'react-dom'),
            },
        },
        plugins: [
            viteConnectDevStudioPlugin(true),
            viteLoadExternalProjects(
                enableExternalProjects,
                options.projectsImportPath,
            ),
            viteEnvs({
                declarationFile: join(studioDirname, '../.env'),
                computedEnv: studioConfig,
            }),
            runShellScriptPlugin(viteEnvsScript),
        ],
        build: {
            rollupOptions: {
                input: 'index.html',
            },
        },
    };

    const server = await createServer(config);

    await server.listen();

    server.printUrls();
    server.bindCLIShortcuts({ print: true });
}
