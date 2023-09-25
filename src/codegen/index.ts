#! /usr/bin/env node
import { DocumentModelState, utils } from 'document-model/document-model';
import {
    generateAll,
    generateEditor as _generateEditor,
    generateDocumentModel,
} from './hygen';
import { generateSchemas, generateSchema } from './graphql';
import type { PowerhouseConfig } from '../utils';
import fs from 'fs';
import { join } from 'path';
import { paramCase } from 'change-case';

function generateGraphqlSchema(state: DocumentModelState) {
    const spec = state.specifications[state.specifications.length - 1];
    if (spec) {
        const schemas = [
            spec.state.schema,
            ...spec.modules
                .map(module => [
                    `# ${module.name}`,
                    ...module.operations.map(op => op.schema),
                ])
                .flat()
                .filter(schema => schema && schema.length > 0),
        ];
        return schemas.join('\n\n');
    } else return null;
}

export async function generate(config: PowerhouseConfig) {
    const { format, watch } = config;
    await generateSchemas(config.documentModelsDir, { format, watch });
    await generateAll(config.documentModelsDir, { format, watch });
}

export async function generateFromFile(path: string, config: PowerhouseConfig) {
    // load document model spec from file
    const documentModel = await utils.loadFromFile(path);
    const name = paramCase(documentModel.state.name);

    // create document model folder and spec as json
    fs.mkdirSync(join(config.documentModelsDir, name), { recursive: true });
    fs.writeFileSync(
        join(config.documentModelsDir, name, `${name}.json`),
        JSON.stringify(documentModel.state, null, 4),
    );

    // bundle graphql schemas together
    const schemaStr = generateGraphqlSchema(documentModel.state);
    if (schemaStr) {
        fs.writeFileSync(
            join(config.documentModelsDir, name, `schema.graphql`),
            schemaStr,
        );
    }

    await generateSchema(name, config.documentModelsDir, config);
    await generateDocumentModel(
        documentModel.state,
        config.documentModelsDir,
        config,
    );
}

export async function generateEditor(name: string, config: PowerhouseConfig) {
    const { format } = config;
    return _generateEditor(name, config.editorsDir, { format });
}
