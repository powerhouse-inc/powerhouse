import { exec } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizePath, PluginOption, ViteDevServer } from 'vite';
import { HMR_MODULE_IMPORT, viteReplaceImports } from './base';

const __dirname =
    import.meta.dirname || dirname(fileURLToPath(import.meta.url));

export const viteLoadHMRModule = (): PluginOption => {
    return [
        viteReplaceImports({
            [HMR_MODULE_IMPORT]: normalizePath(join(__dirname, 'hmr.js')),
        }),
        {
            name: 'vite-plugin-studio-hmr-module',
            configureServer(server) {
                handleExternalPackageEvents(server);
            },
        },
    ];
};

const handleExternalPackageEvents = (server: ViteDevServer) => {
    server.ws.on('studio:add-external-package', (data, client) => {
        const { name } = data as { name: string };
        const installProcess = exec(
            `ph install ${name}`,
            {
                cwd: process.cwd(),
            },
            error => {
                if (error) {
                    console.error(`\t[${name}]: ${error.message}`);
                } else {
                    server.ws.send('studio:external-package-added', {
                        name,
                    });
                }
            },
        );
        installProcess.stdout?.on('data', (data: Buffer) => {
            console.log(`\t[${name}]: ${data.toString().trim()}`);
        });
        console.log('Installing external package:', name);
    });

    server.ws.on('studio:remove-external-package', (data, client) => {
        const { name } = data as { name: string };
        console.log('Removing external package', name);
    });
};
