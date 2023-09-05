#! /usr/bin/env node
import { generate } from './codegen';

async function main() {
    await generate();
}

main();
