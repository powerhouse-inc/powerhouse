#! /usr/bin/env node
import { generateAll } from './hygen.js';
import { executeAll } from './graphql-codegen.js';

async function main() {
    await executeAll();
    await generateAll();
}

main();
