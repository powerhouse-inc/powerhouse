import { utils } from 'document-model/document';
import { writeFileSync } from 'fs';
import operations from './operations.json';

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
                const _value = typeof value === 'function' ? value() : value;
                operation[key] = _value;
            }
        }

        if (fieldsToRemove) {
            for (const field of fieldsToRemove) {
                delete operation[field];
            }
        }
    }

    writeFileSync(
        './operations-updated.json',
        JSON.stringify(operations, null, 2),
    );
}

const fieldsToChange = {
    id: () => utils.hashKey(),
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

updateOperations(operations, 'global', fieldsToChange, fieldsToRemove);
