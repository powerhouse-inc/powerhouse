// Command = action => should process the action and asign the index, timestamp, and hash
// Event = operation => should keep the same operation information but execute the action input against the document

import { createDocument } from '../../src/document/utils';
import { emptyReducer, wrappedEmptyReducer } from '../helpers';

describe('Event', () => {
    beforeAll(() => {
        vi.useFakeTimers().setSystemTime(new Date('2020-01-01'));
    });

    it('should not re-assing index to an event', () => {
        let document = createDocument();

        document = emptyReducer(document, {
            type: 'TEST',
            input: {},
            scope: 'global',
        });

        document = emptyReducer(document, {
            type: 'TEST_2',
            input: {},
            scope: 'global',
        });

        document = wrappedEmptyReducer(
            document,
            {
                type: 'TEST_4',
                input: {},
                index: 3,
                hash: 'test-4-hash',
                scope: 'global',
            },
            undefined,
            { skip: 1 },
        );

        expect(document.revision.global).toBe(4);
        expect(document.operations.global).toMatchObject([
            {
                type: 'TEST',
                index: 0,
            },
            {
                type: 'TEST_2',
                index: 1,
            },
            {
                type: 'TEST_4',
                index: 3,
                skip: 1,
            },
        ]);
    });

    it('should change to NOOP when event includes skip and operation to be skipped is in the history', () => {
        let document = createDocument();

        document = emptyReducer(document, {
            type: 'TEST',
            input: {},
            scope: 'global',
        });

        document = emptyReducer(document, {
            type: 'TEST_2',
            input: {},
            scope: 'global',
        });

        document = emptyReducer(document, {
            type: 'TEST_3',
            input: {},
            scope: 'global',
        });

        document = wrappedEmptyReducer(
            document,
            {
                type: 'TEST_4',
                input: {},
                index: 3,
                hash: 'test-4-hash',
                scope: 'global',
            },
            undefined,
            { skip: 1 },
        );

        expect(document.revision.global).toBe(4);
        expect(document.operations.global).toMatchObject([
            {
                type: 'TEST',
                index: 0,
            },
            {
                type: 'TEST_2',
                index: 1,
            },
            {
                type: 'NOOP',
                index: 2,
            },
            {
                type: 'TEST_4',
                index: 3,
                skip: 1,
            },
        ]);
    });

    it('should continue with next index after an operation', () => {
        let document = createDocument();

        document = emptyReducer(document, {
            type: 'TEST',
            input: {},
            scope: 'global',
        });

        document = emptyReducer(document, {
            type: 'TEST_2',
            input: {},
            scope: 'global',
        });

        document = wrappedEmptyReducer(
            document,
            {
                type: 'TEST_4',
                input: {},
                index: 3,
                hash: 'test-4-hash',
                scope: 'global',
            },
            undefined,
            { skip: 1 },
        );

        document = emptyReducer(document, {
            type: 'TEST_5',
            input: {},
            scope: 'global',
        });

        expect(document.revision.global).toBe(5);
        expect(document.operations.global).toMatchObject([
            {
                type: 'TEST',
                index: 0,
            },
            {
                type: 'TEST_2',
                index: 1,
            },
            {
                type: 'TEST_4',
                index: 3,
                skip: 1,
            },
            {
                type: 'TEST_5',
                index: 4,
            },
        ]);
    });

    it('should calculate the right document revision when last action is an event', () => {
        let document = createDocument();

        document = emptyReducer(document, {
            type: 'TEST',
            input: {},
            scope: 'global',
        });

        document = emptyReducer(document, {
            type: 'TEST_2',
            input: {},
            scope: 'global',
        });

        document = wrappedEmptyReducer(
            document,
            {
                type: 'TEST_4',
                input: {},
                index: 3,
                hash: 'test-4-hash',
                scope: 'global',
            },
            undefined,
            { skip: 1 },
        );

        expect(document.revision.global).toBe(4);
        expect(document.operations.global).toMatchObject([
            {
                type: 'TEST',
                index: 0,
            },
            {
                type: 'TEST_2',
                index: 1,
            },
            {
                type: 'TEST_4',
                index: 3,
                skip: 1,
            },
        ]);
    });
});
