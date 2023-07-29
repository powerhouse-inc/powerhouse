import { DocumentModelState } from '@acaldas/document-model-graphql/document-model';
import { paramCase } from 'change-case';
import { runner } from 'hygen';
import Logger from 'hygen/dist/logger';
import path from 'path';

const logger = new Logger(console.log.bind(console));
const defaultTemplates = path.join(__dirname, 'templates');

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
    // loads document model
    const document = process.argv.at(2) || 'document-model';
    let documentModel: DocumentModelState;
    try {
        documentModel = (await import(`./models/${document}`)).default;
    } catch (error) {
        throw error.code === 'MODULE_NOT_FOUND'
            ? new Error(`Document model "${document}" not found.`)
            : error;
    }

    // Generate the singular files for the document model logic
    await run([
        'powerhouse',
        'generate-document-model',
        '--document-model',
        JSON.stringify(documentModel),
    ]);

    // Generate the module-specific files for the document model logic
    const latestSpec = documentModel.specifications[documentModel.specifications.length - 1];
    const modules = latestSpec.modules.map(m => paramCase(m.name));
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
