#! /usr/bin/env node
import { generate } from './codegen/index.js';

async function main() {
    await generate();
}

main();
