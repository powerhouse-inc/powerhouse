import { Command } from 'commander';
import fs from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { startServer } from './server';

type PowerhouseConfig = {
    documentModelsDir?: string;
    editorsDir?: string;
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
    configFile?: string;
    localEditors?: string;
    localDocuments?: string;
};

export function startConnectStudio(options: ConnectStudioOptions) {
    if (options.port) {
        process.env.PORT = options.port;
    }

    if (options.host) {
        process.env.HOST = options.host.toString();
    }

    if (options.configFile) {
        const config = readJsonFile(options.configFile);
        if (!config) return;

        const configFileDir = dirname(options.configFile);

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
    }

    if (options.localEditors) {
        process.env.LOCAL_DOCUMENT_EDITORS = options.localEditors;
    }

    if (options.localDocuments) {
        process.env.LOCAL_DOCUMENT_MODELS = options.localDocuments;
    }

    return startServer().catch(error => {
        throw error;
    });
}

export const program = new Command();

program
    .name('Connect Studio')
    .description('Connect Studio CLI')
    .option('-p, --port <port>', 'Port to run the server on', '3000')
    .option('-h, --host', 'Expose the server to the network')
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
