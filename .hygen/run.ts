import { paramCase } from 'change-case';
import { runner } from 'hygen';
import Logger from 'hygen/dist/logger';
import path from 'path';
import documentModel from './models/document-model';

const logger = new Logger(console.log.bind(console));
const defaultTemplates = path.join(__dirname, 'templates');
const modules = documentModel.modules.map(m => paramCase(m.name));

const run = async (args: string[]) => {
    await runner(args, {
        templates: defaultTemplates,
        cwd: process.cwd(),
        logger,
        createPrompter: () => {
            return require('enquirer');
        },
        exec: (action, body) => {
            const opts = body && body.length > 0 ? { input: body } : {};
            return require('execa').shell(action, opts);
        },
        debug: !!process.env.DEBUG,
    });
};

const runAll = async () => {
    // Generate the singular files for the document model logic
    await run([
        'powerhouse',
        'generate-document-model',
        '--document-model',
        JSON.stringify(documentModel),
    ]);

    // Generate the module-specific files for the document model logic
    for (let i = 0; i < modules.length; i++) {
        await run([
            'powerhouse',
            'generate-document-model-module',
            '--document-model',
            JSON.stringify(documentModel),
            '--module',
            modules[i],
        ]);
    }
};

runAll();
