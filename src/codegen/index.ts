#! /usr/bin/env node
import { generateAll } from './hygen';
import { executeAll } from './graphql';
import type { PowerhouseConfig } from '../utils';

export async function generate(config: PowerhouseConfig) {
    const { format, watch } = config;
    await executeAll(config.documentModelsDir, { format, watch });
    await generateAll(config.documentModelsDir, { format, watch });
}
