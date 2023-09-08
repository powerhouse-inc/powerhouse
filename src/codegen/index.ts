#! /usr/bin/env node
import { generateAll } from './hygen.js';
import { executeAll } from './graphql.js';

export async function generate(config: PowerhouseConfig) {
    await executeAll(config.documentModelsDir);
    await generateAll(config.documentModelsDir);
}
