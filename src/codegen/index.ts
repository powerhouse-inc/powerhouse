#! /usr/bin/env node
import { generateAll } from './hygen.js';
import { executeAll } from './graphql.js';
import type { PowerhouseConfig } from '../utils.js';

export async function generate(config: PowerhouseConfig) {
    const { format, watch } = config;
    await executeAll(config.documentModelsDir, { format, watch });
    await generateAll(config.documentModelsDir, { format, watch });
}
