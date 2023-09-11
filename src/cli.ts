#! /usr/bin/env node
import { readFileSync } from 'fs';
import { generate } from './codegen/index.js';

function loadConfig() {
    let config: PowerhouseConfig = {
        documentModelsDir: './document-models',
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

async function main() {
    const config = loadConfig();
    await generate(config);
}

main();
