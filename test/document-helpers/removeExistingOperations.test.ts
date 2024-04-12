import { describe, expect, it } from 'vitest';

import { removeExistingOperations } from '../../src/utils/document-helpers';
import { buildOperations } from './utils';

describe('removeExistingOperations', () => {
    const scenarios = [
        {
            title: 'case 1: all new operations should be applied',
            operationsHistory: [
                { index: 0, skip: 0, type: 'OP_0', hash: 'hash_0' },
                { index: 1, skip: 0, type: 'OP_1', hash: 'hash_1' },
                { index: 2, skip: 0, type: 'OP_2', hash: 'hash_2' }
            ],
            newOperations: [
                { index: 4, skip: 0, type: 'OP_4', hash: 'hash_4' },
                { index: 5, skip: 0, type: 'OP_5', hash: 'hash_5' },
                { index: 6, skip: 0, type: 'OP_6', hash: 'hash_6' }
            ],
            expected: [
                { index: 4, skip: 0, type: 'OP_4', hash: 'hash_4' },
                { index: 5, skip: 0, type: 'OP_5', hash: 'hash_5' },
                { index: 6, skip: 0, type: 'OP_6', hash: 'hash_6' }
            ]
        },
        {
            title: 'case 2: return no operations, all of them already exist in the history',
            operationsHistory: [
                { index: 0, skip: 0, type: 'OP_0', hash: 'hash_0' },
                { index: 1, skip: 0, type: 'OP_1', hash: 'hash_1' },
                { index: 2, skip: 0, type: 'OP_2', hash: 'hash_2' }
            ],
            newOperations: [
                { index: 0, skip: 0, type: 'OP_0', hash: 'hash_0' },
                { index: 1, skip: 0, type: 'OP_1', hash: 'hash_1' },
                { index: 2, skip: 0, type: 'OP_2', hash: 'hash_2' }
            ],
            expected: []
        },
        {
            title: 'case 3: return only operation that does not exist in the history',
            operationsHistory: [
                { index: 0, skip: 0, type: 'OP_0', hash: 'hash_0' },
                { index: 1, skip: 0, type: 'OP_1', hash: 'hash_1' },
                { index: 2, skip: 0, type: 'OP_2', hash: 'hash_2' },
                { index: 3, skip: 0, type: 'OP_3', hash: 'hash_3' },
                { index: 4, skip: 0, type: 'OP_4', hash: 'hash_4' },
                { index: 5, skip: 0, type: 'OP_5', hash: 'hash_5' }
            ],
            newOperations: [
                { index: 4, skip: 0, type: 'OP_4', hash: 'hash_4' },
                { index: 5, skip: 0, type: 'OP_5', hash: 'hash_5' },
                { index: 6, skip: 0, type: 'OP_6', hash: 'hash_6' },
                { index: 7, skip: 0, type: 'OP_7', hash: 'hash_7' }
            ],
            expected: [
                { index: 6, skip: 0, type: 'OP_6', hash: 'hash_6' },
                { index: 7, skip: 0, type: 'OP_7', hash: 'hash_7' }
            ]
        },
        {
            title: 'case 4: return only operation that does not exist in the history',
            operationsHistory: [
                { index: 0, skip: 0, type: 'OP_0', hash: 'hash_0' },
                { index: 2, skip: 0, type: 'OP_2', hash: 'hash_2' },
                { index: 4, skip: 0, type: 'OP_4', hash: 'hash_4' }
            ],
            newOperations: [
                { index: 0, skip: 0, type: 'OP_0', hash: 'hash_0' },
                { index: 1, skip: 0, type: 'OP_1', hash: 'hash_1' },
                { index: 2, skip: 0, type: 'OP_2', hash: 'hash_2' },
                { index: 3, skip: 0, type: 'OP_3', hash: 'hash_3' },
                { index: 4, skip: 0, type: 'OP_4', hash: 'hash_4' },
                { index: 5, skip: 0, type: 'OP_5', hash: 'hash_5' }
            ],
            expected: [
                { index: 1, skip: 0, type: 'OP_1', hash: 'hash_1' },
                { index: 3, skip: 0, type: 'OP_3', hash: 'hash_3' },
                { index: 5, skip: 0, type: 'OP_5', hash: 'hash_5' }
            ]
        }
    ];

    it.each(scenarios)('$title', testInput => {
        const newOperations = buildOperations(testInput.newOperations);
        const operationsHistory = buildOperations(testInput.operationsHistory);

        const result = removeExistingOperations(
            newOperations,
            operationsHistory
        );

        expect(result).toMatchObject(testInput.expected);
    });
});
