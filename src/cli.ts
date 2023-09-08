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
    } catch {}
    return config;
}

async function main() {
    const config = loadConfig();
    await generate(config);
}

main();
