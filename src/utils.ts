import { readFileSync } from 'node:fs';

export type PowerhouseConfig = {
    documentModelsDir: string;
    editorsDir: string;
    format?: boolean;
    watch?: boolean;
};

export function getConfig() {
    let config: PowerhouseConfig = {
        documentModelsDir: './document-models',
        editorsDir: './editors',
    };
    try {
        const configStr = readFileSync('./powerhouse.config.json', 'utf-8');
        let userConfig: PowerhouseConfig = JSON.parse(configStr);
        config = { ...config, ...userConfig };

        if (process.argv.includes('--format')) {
            config.format = true;
        }
        if (process.argv.includes('--watch')) {
            config.watch = true;
        }
    } catch {}
    return config;
}
