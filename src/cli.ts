#! /usr/bin/env node
import { generate } from './codegen/index';
import { parseArgs, getConfig, promptDirectories } from './utils';

async function main() {
    const baseConfig = getConfig();
    const argsConfig = parseArgs();
    const config = { ...baseConfig, ...argsConfig };

    if (config.interactive) {
        const result = await promptDirectories(config);
        Object.assign(config, result);
    }

    await generate(config);
}

main();
