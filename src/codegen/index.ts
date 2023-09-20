#! /usr/bin/env node
import { generateAll, generateEditor as _generateEditor } from './hygen';
import { executeAll } from './graphql';
import type { PowerhouseConfig } from '../utils';

export async function generate(config: PowerhouseConfig) {
    const { format, watch } = config;
    await executeAll(config.documentModelsDir, { format, watch });
    await generateAll(config.documentModelsDir, { format, watch });
}

export async function generateEditor(name: string, config: PowerhouseConfig) {
    const { format } = config;
    return _generateEditor(name, config.editorsDir, { format });
}
