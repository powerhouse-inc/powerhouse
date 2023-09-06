import 'ts-node/register/transpile-only';
import { DocumentModel } from 'document-model';
import { paramCase } from 'change-case';
import { Logger, runner } from 'hygen';
import path from 'path';
import fs from 'fs';

const logger = new Logger(console.log.bind(console));
const defaultTemplates = path.join(__dirname, '../../', '.hygen', 'templates');

const MODELS_DIR = './document-models';
const DEFAULT_ROOT_DIR = './document-models';

async function run(args: string[]) {
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
}

async function loadDocumentModel(
    path: string,
): Promise<DocumentModel.DocumentModelState> {
    let documentModel: DocumentModel.DocumentModelState;
    try {
        if (!path) {
            throw new Error('Document model file not specified');
        } else if (path.endsWith('.zip')) {
            const file = await DocumentModel.utils.loadFromFile(path);
            documentModel = file.state;
        } else if (path.endsWith('.json')) {
            const data = fs.readFileSync(path, 'utf-8');
            documentModel = JSON.parse(data);
        } else {
            throw new Error('File type not supported. Must be zip or json.');
        }
        return documentModel;
    } catch (error) {
        // @ts-ignore
        throw error.code === 'MODULE_NOT_FOUND'
            ? new Error(`Document model "${document}" not found.`)
            : error;
    }
}

export async function generateAll(dir = MODELS_DIR) {
    const files = fs.readdirSync(dir, { withFileTypes: true });
    for (const file of files.filter(f => f.isFile())) {
        try {
            const documentModel = await loadDocumentModel(
                path.join(dir, file.name),
            );
            await generateDocumentModel(documentModel);
        } catch (error) {
            console.error(file, error);
        }
    }
}

export async function generateDocumentModel(
    documentModel: DocumentModel.DocumentModelState,
) {
    // Generate the singular files for the document model logic
    await run([
        'powerhouse',
        'generate-document-model',
        '--document-model',
        JSON.stringify(documentModel),
        '--root-dir',
        DEFAULT_ROOT_DIR,
    ]);

    // Generate the module-specific files for the document model logic
    const latestSpec =
        documentModel.specifications[documentModel.specifications.length - 1];
    const modules = latestSpec.modules.map((m: { name: string }) =>
        paramCase(m.name),
    );
    for (let i = 0; i < modules.length; i++) {
        await run([
            'powerhouse',
            'generate-document-model-module',
            '--document-model',
            JSON.stringify(documentModel),
            '--root-dir',
            DEFAULT_ROOT_DIR,
            '--module',
            modules[i],
        ]);
    }
}
