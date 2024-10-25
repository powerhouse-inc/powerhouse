import { exec } from 'node:child_process';
import fs from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLogger, createServer, InlineConfig, Plugin } from 'vite';
import { viteEnvs } from 'vite-envs';
import { getStudioConfig, viteConnectDevStudioPlugin } from './vite-plugin';

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

export async function startServer() {
    const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;
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
            open: true,
            host: Boolean(process.env.HOST),
        },
        resolve: {
            alias: {
                // Resolve to the node_modules in the project root
                '@powerhousedao/scalars': join(
                    projectRoot,
                    'node_modules',
                    '@powerhousedao',
                    'scalars',
                ),
            },
        },
        plugins: [
            viteConnectDevStudioPlugin(true),
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
