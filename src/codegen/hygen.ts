import 'ts-node/register/transpile-only';
import { DocumentModel } from 'document-model';
import { paramCase } from 'change-case';
import { Logger, runner } from 'hygen';
import path from 'path';
import fs from 'fs';

const logger = new Logger(console.log.bind(console));
const defaultTemplates = path.join(__dirname, '../', '.hygen', 'templates');

async function run(args: string[], { watch = false, format = false } = {}) {
    const result = await runner(args, {
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
    if (format) {
        const execa = await import('execa');
        result.actions
            .filter(action => ['added', 'inject'].includes(action.status))
            .forEach(action => {
                execa.$`prettier --ignore-path --write ${action.subject.replace(
                    '.',
                    process.cwd(),
                )}`;
            });
    }

    return result;
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

export async function generateAll(
    dir: string,
    { watch = false, format = false } = {},
) {
    const files = fs.readdirSync(dir, { withFileTypes: true });
    for (const directory of files.filter(f => f.isDirectory())) {
        const documentModelPath = path.join(
            dir,
            directory.name,
            `${directory.name}.json`,
        );
        if (!fs.existsSync(documentModelPath)) {
            continue;
        }

        try {
            const documentModel = await loadDocumentModel(documentModelPath);
            await generateDocumentModel(documentModel, dir, { watch, format });
        } catch (error) {
            console.error(directory.name, error);
        }
    }
}

export async function generateDocumentModel(
    documentModel: DocumentModel.DocumentModelState,
    dir: string,
    { watch = false, format = false } = {},
) {
    // Generate the singular files for the document model logic
    await run(
        [
            'powerhouse',
            'generate-document-model',
            '--document-model',
            JSON.stringify(documentModel),
            '--root-dir',
            dir,
        ],
        { watch, format },
    );

    // Generate the module-specific files for the document model logic
    const latestSpec =
        documentModel.specifications[documentModel.specifications.length - 1];
    const modules = latestSpec.modules.map((m: { name: string }) =>
        paramCase(m.name),
    );
    for (let i = 0; i < modules.length; i++) {
        await run(
            [
                'powerhouse',
                'generate-document-model-module',
                '--document-model',
                JSON.stringify(documentModel),
                '--root-dir',
                dir,
                '--module',
                modules[i],
            ],
            { watch, format },
        );
    }
}
