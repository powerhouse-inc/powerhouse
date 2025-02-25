import { PowerhouseConfig } from '@powerhousedao/config/powerhouse';
import { Command } from 'commander';
import fs from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { startServer, StartServerOptions } from './server';

export type Project = {
    name: string;
    path: string;
};

const readJsonFile = (filePath: string): PowerhouseConfig | null => {
    try {
        const absolutePath = resolve(filePath);
        const fileContents = fs.readFileSync(absolutePath, 'utf-8');
        return JSON.parse(fileContents) as PowerhouseConfig;
    } catch (error) {
        console.error(`Error reading file: ${filePath}`);
        return null;
    }
};

export type ConnectStudioOptions = {
    port?: string;
    host?: boolean;
    https?: boolean;
    configFile?: string;
    localEditors?: string;
    localDocuments?: string;
    open?: boolean;
    packages?: { packageName: string }[];
    phCliVersion?: string;
    logLevel?: 'verbose' | 'debug' | 'info' | 'warn' | 'error' | 'silent';
};

export function startConnectStudio(options: ConnectStudioOptions) {
    const serverOptions: StartServerOptions = {
        logLevel: options.logLevel ?? 'debug',
    };

    if (options.port) {
        process.env.PORT = options.port;
    }

    if (options.host) {
        process.env.HOST = options.host.toString();
    }

    if (typeof options.open === 'boolean') {
        serverOptions.open = options.open;
    }

    if (options.configFile) {
        const config = readJsonFile(options.configFile);
        if (!config) return;

        const configFileDir = dirname(options.configFile);

        if (config.packages && config.packages.length > 0) {
            serverOptions.packages = config.packages.map(p => p.packageName);
        }

        if (config.documentModelsDir) {
            process.env.LOCAL_DOCUMENT_MODELS = isAbsolute(
                config.documentModelsDir,
            )
                ? config.documentModelsDir
                : join(configFileDir, config.documentModelsDir);
        }

        if (config.editorsDir) {
            process.env.LOCAL_DOCUMENT_EDITORS = isAbsolute(config.editorsDir)
                ? config.editorsDir
                : join(configFileDir, config.editorsDir);
        }

        if (config.studio?.port) {
            process.env.PORT = config.studio.port.toString();
        }

        if (typeof config.studio?.openBrowser === 'boolean') {
            process.env.OPEN_BROWSER = config.studio.openBrowser.toString();
        }

        if (config.studio?.host) {
            process.env.HOST = config.studio.host;
        }
    }

    if (options.packages && options.packages.length > 0) {
        serverOptions.packages = options.packages.map(p => p.packageName);
    }

    if (options.localEditors) {
        process.env.LOCAL_DOCUMENT_EDITORS = options.localEditors;
    }

    if (options.localDocuments) {
        process.env.LOCAL_DOCUMENT_MODELS = options.localDocuments;
    }

    if (options.https) {
        serverOptions.https = options.https;
    }

    if (options.phCliVersion) {
        serverOptions.phCliVersion = options.phCliVersion;
    }

    return startServer(serverOptions).catch(error => {
        throw error;
    });
}

export const program = new Command();

program
    .name('Connect Studio')
    .description('Connect Studio CLI')
    .option('-p, --port <port>', 'Port to run the server on', '3000')
    .option('-h, --host', 'Expose the server to the network')
    .option('--https', 'Enable HTTPS')
    .option('--open', 'Open the browser on start')
    .option(
        '--config-file <configFile>',
        'Path to the powerhouse.config.js file',
    )
    .option(
        '-le, --local-editors <localEditors>',
        'Link local document editors path',
    )
    .option(
        '-ld, --local-documents <localDocuments>',
        'Link local documents path',
    )
    .action(startConnectStudio);

program
    .command('help')
    .description('Display help information')
    .action(() => {
        program.help();
    });
