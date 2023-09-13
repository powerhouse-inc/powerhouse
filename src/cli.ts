#! /usr/bin/env node
import { generate } from './codegen/index.js';
import { getConfig } from './utils.js';

async function main() {
    const config = getConfig();
    await generate(config);
}

main();
