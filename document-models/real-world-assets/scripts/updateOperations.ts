import { utils as docUtils } from 'document-model/document';
import { readdir, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { RealWorldAssetsAction, reducer, utils } from '..';
import { readFileSync } from 'node:fs';

function updateOperations(
    operations: {
        global: Record<string, any>[];
        local: Record<string, any>[];
    },
    scope: 'global' | 'local',
    fieldsToChange?: Record<string, any>,
    fieldsToRemove?: string[],
) {
    for (const operation of operations[scope]) {
        if (fieldsToChange) {
            for (const [key, value] of Object.entries(fieldsToChange)) {
                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
                const _value = typeof value === 'function' ? value() : value;
                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                operation[key] = _value;
            }
        }

        if (fieldsToRemove) {
            for (const field of fieldsToRemove) {
                // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
                delete operation[field];
            }
        }
    }
}

const srcDir = 'documents';
const targetDir = 'documents-updated';

const documentDirNames = await readdir(srcDir);

const fieldsToChange = {
    id: () => docUtils.hashKey(),
    context: {
        signer: {
            user: {
                address: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
                chainId: 1,
            },
        },
    },
};

const fieldsToRemove = ['resultingState'];

for (const name of documentDirNames) {
    const path = join(srcDir, name, 'operations.json');
    const file = readFileSync(path);
    const operations = JSON.parse(file.toString()) as {
        global: Record<string, any>[];
        local: Record<string, any>[];
    };
    updateOperations(operations, 'global', fieldsToChange, fieldsToRemove);
    let document = utils.createDocument();
    for (const operation of operations.global) {
        document = reducer(document, operation as RealWorldAssetsAction);
    }
    await utils.saveToFile(document, targetDir, `${name}-updated`);
}

const updatedDocumentFileNames = await readdir(targetDir);

for (const name of updatedDocumentFileNames) {
    const path = join(targetDir, name);
    const fixedName = name.replace('..zip', '.zip');
    const fixedNamePath = join(targetDir, fixedName);
    await rename(path, fixedNamePath);
}
