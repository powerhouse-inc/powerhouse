#! /usr/bin/env node
import { generateAll } from './hygen.js';
import { executeAll } from './graphql.js';

export async function generate() {
    await executeAll();
    await generateAll();
}
