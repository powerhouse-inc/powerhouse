import { describe, it, expect } from 'vitest';
import { Operation, utils } from '../../src/document';
import { setName } from '../../src/document/actions/creators';
import {
    createDocument,
    createExtendedState,
    mapSkippedOperations,
    calculateSkipsLeft,
} from '../../src/document/utils';
import {
    emptyReducer,
    mapOperations,
    createFakeOperation,
    CountState,
    CountAction,
    CountLocalState,
    countReducer,
    increment,
    baseCountReducer,
} from '../helpers';

describe('skip operations', () => {
    describe('skip operation param', () => {
        it('should include skip param in base operations with default value to 0 if not provided', () => {
            let document = createDocument();
            document = emptyReducer(document, setName('TEST_1'));
            document = emptyReducer(document, setName('TEST_2'));
            document = emptyReducer(document, setName('TEST_3'));

            expect(document.revision.global).toBe(3);

            const ops = mapOperations(document.operations.global);

            expect(ops.length).toBe(3);

            ops.forEach(op => {
                expect(op).toHaveProperty('skip', 0);
            });
        });

        it('should include skip param in base operations with provided value', () => {
            let document = createDocument();
            document = emptyReducer(document, setName('TEST_1'), undefined, {
                skip: 1,
                ignoreSkipOperations: true,
            });
            document = emptyReducer(document, setName('TEST_2'), undefined, {
                skip: 2,
                ignoreSkipOperations: true,
            });
            document = emptyReducer(document, setName('TEST_3'), undefined, {
                skip: 3,
                ignoreSkipOperations: true,
            });

            expect(document.revision.global).toBe(3);

            const ops = mapOperations(document.operations.global);

            expect(ops.length).toBe(3);

            ops.forEach((op, index) => {
                expect(op).toHaveProperty('skip', index + 1);
            });
        });
    });

    describe('mapSkippedOperations', () => {
        it('should tag as "ignored" operation 2 when operation 3 -> (skip=1)', () => {
            const operations = [
                createFakeOperation(1),
                createFakeOperation(2),
                createFakeOperation(3, 1),
            ];

            const ignoredIndexes = [2];

            const mappedOps = mapSkippedOperations(operations);
            expect(mappedOps.length).toBe(3);
            mappedOps.forEach(mapOp => {
                let ignore = false;
                if (ignoredIndexes.includes(mapOp.operation.index)) {
                    ignore = true;
                }

                expect(mapOp).toHaveProperty('ignore', ignore);
            });
        });

        it('should tag as "ignored" operation 2, 3 and 4 when operation 5 -> (skip=3)', () => {
            const operations = [
                createFakeOperation(1),
                createFakeOperation(2),
                createFakeOperation(3),
                createFakeOperation(4),
                createFakeOperation(5, 3),
            ];

            const ignoredIndexes = [2, 3, 4];

            const mappedOps = mapSkippedOperations(operations);
            expect(mappedOps.length).toBe(5);
            mappedOps.forEach(mapOp => {
                let ignore = false;
                if (ignoredIndexes.includes(mapOp.operation.index)) {
                    ignore = true;
                }

                expect(mapOp).toHaveProperty('ignore', ignore);
            });
        });

        it('should tag as "ignored" operation 2 and 5 when opration 3 -> (skip=1) and operation 6 -> (skip=1)', () => {
            const operations = [
                createFakeOperation(1),
                createFakeOperation(2),
                createFakeOperation(3, 1),
                createFakeOperation(4),
                createFakeOperation(5),
                createFakeOperation(6, 1),
            ];

            const ignoredIndexes = [2, 5];

            const mappedOps = mapSkippedOperations(operations);
            expect(mappedOps.length).toBe(6);
            mappedOps.forEach(mapOp => {
                let ignore = false;
                if (ignoredIndexes.includes(mapOp.operation.index)) {
                    ignore = true;
                }

                expect(mapOp).toHaveProperty('ignore', ignore);
            });
        });

        it('should tag as "ignored" operation 1, 2, 3, 4, 5 and 6 when opration 7 -> (skip=6)', () => {
            const operations = [
                createFakeOperation(1),
                createFakeOperation(2),
                createFakeOperation(3),
                createFakeOperation(4),
                createFakeOperation(5),
                createFakeOperation(6),
                createFakeOperation(7, 6),
            ];

            const ignoredIndexes = [1, 2, 3, 4, 5, 6];

            const mappedOps = mapSkippedOperations(operations);
            expect(mappedOps.length).toBe(7);
            mappedOps.forEach(mapOp => {
                let ignore = false;
                if (ignoredIndexes.includes(mapOp.operation.index)) {
                    ignore = true;
                }

                expect(mapOp).toHaveProperty('ignore', ignore);
            });
        });

        it('should tag as "ignored" operation 2, 3, and 4 when operation 5 -> (skip=2) and operation 3 -> (skip=1)', () => {
            const operations = [
                createFakeOperation(1),
                createFakeOperation(2),
                createFakeOperation(3, 1),
                createFakeOperation(4),
                createFakeOperation(5, 2),
            ];

            const ignoredIndexes = [2, 3, 4];

            const mappedOps = mapSkippedOperations(operations);
            expect(mappedOps.length).toBe(5);
            mappedOps.forEach(mapOp => {
                let ignore = false;
                if (ignoredIndexes.includes(mapOp.operation.index)) {
                    ignore = true;
                }

                expect(mapOp).toHaveProperty('ignore', ignore);
            });
        });

        it('should tag as "ignored" operations 3, 4, 5, 6, and 7 when operation 6 -> (skip=1) and operation 8 -> (skip=5)', () => {
            const operations = [
                createFakeOperation(1),
                createFakeOperation(2),
                createFakeOperation(3),
                createFakeOperation(4),
                createFakeOperation(5),
                createFakeOperation(6, 1),
                createFakeOperation(7),
                createFakeOperation(8, 5),
            ];

            const ignoredIndexes = [3, 4, 5, 6, 7];

            const mappedOps = mapSkippedOperations(operations);
            expect(mappedOps.length).toBe(8);
            mappedOps.forEach(mapOp => {
                let ignore = false;
                if (ignoredIndexes.includes(mapOp.operation.index)) {
                    ignore = true;
                }

                expect(mapOp).toHaveProperty('ignore', ignore);
            });
        });

        it('should tag all the previous operations as "ignored" when operation 5 -> (skip=4)', () => {
            const operations = [
                createFakeOperation(1),
                createFakeOperation(2),
                createFakeOperation(3),
                createFakeOperation(4),
                createFakeOperation(5, 4),
            ];

            const ignoredIndexes = [1, 2, 3, 4];

            const mappedOps = mapSkippedOperations(operations);
            expect(mappedOps.length).toBe(5);
            mappedOps.forEach(mapOp => {
                let ignore = false;
                if (ignoredIndexes.includes(mapOp.operation.index)) {
                    ignore = true;
                }

                expect(mapOp).toHaveProperty('ignore', ignore);
            });
        });

        it("should not skip operations if there's not skipped operations and skippedHeadOperations is not provided", () => {
            const operations = [
                createFakeOperation(1),
                createFakeOperation(2),
                createFakeOperation(3),
            ];

            const mappedOps = mapSkippedOperations(operations);
            expect(mappedOps.length).toBe(3);
            mappedOps.forEach(mapOp => {
                expect(mapOp).toHaveProperty('ignore', false);
            });
        });

        it('should skip the latest operation when skippedHeadOperations = 1', () => {
            const operations = [
                createFakeOperation(1),
                createFakeOperation(2),
                createFakeOperation(3),
            ];

            const ignoredIndexes = [3];

            const mappedOps = mapSkippedOperations(operations, 1);
            expect(mappedOps.length).toBe(3);
            mappedOps.forEach(mapOp => {
                let ignore = false;
                if (ignoredIndexes.includes(mapOp.operation.index)) {
                    ignore = true;
                }

                expect(mapOp).toHaveProperty('ignore', ignore);
            });
        });

        it('should skip the latest 2 operations when skippedHeadOperations = 2', () => {
            const operations = [
                createFakeOperation(1),
                createFakeOperation(2),
                createFakeOperation(3),
                createFakeOperation(4),
                createFakeOperation(5),
            ];

            const ignoredIndexes = [4, 5];

            const mappedOps = mapSkippedOperations(operations, 2);
            expect(mappedOps.length).toBe(5);
            mappedOps.forEach(mapOp => {
                let ignore = false;
                if (ignoredIndexes.includes(mapOp.operation.index)) {
                    ignore = true;
                }

                expect(mapOp).toHaveProperty('ignore', ignore);
            });
        });

        it('should be able to detect cleared operations', () => {
            const operations = [
                createFakeOperation(0),
                createFakeOperation(1),
                createFakeOperation(3, 1),
            ];

            const mappedOps = mapSkippedOperations(operations);
            expect(mappedOps.length).toBe(3);
            mappedOps.forEach(mapOp => {
                expect(mapOp).toHaveProperty('ignore', false);
            });
        });
    });

    // TODO: remove this tests, this function is not used anymore
    describe.skip('calculateSkipsLeft', () => {
        it('should return 0 when there are no skip operations to be performed', () => {
            const operations = [
                createFakeOperation(0),
                createFakeOperation(1),
                createFakeOperation(2),
            ];

            const skipsLeft = calculateSkipsLeft(operations, 4, 1);
            expect(skipsLeft).toBe(0);
        });

        it('should return 1 when there is still 1 operation to be skipped', () => {
            const operations = [
                createFakeOperation(0),
                createFakeOperation(1),
                createFakeOperation(2),
            ];

            const skipsLeft = calculateSkipsLeft(operations, 4, 2);
            expect(skipsLeft).toBe(1);
        });

        it('should return 3 when there is still 3 operations to be skipped', () => {
            const operations = [
                createFakeOperation(0),
                createFakeOperation(1),
                createFakeOperation(2),
                createFakeOperation(3),
                createFakeOperation(4),
            ];

            const skipsLeft = calculateSkipsLeft(operations, 6, 4);
            expect(skipsLeft).toBe(3);
        });

        it('should return 2 when there is still 2 operations to be skipped (gap between operations)', () => {
            const operations = [
                createFakeOperation(0),
                createFakeOperation(1),
                createFakeOperation(2),
                createFakeOperation(4),
            ];

            const skipsLeft = calculateSkipsLeft(operations, 6, 4);
            expect(skipsLeft).toBe(2);
        });

        it('should return 0 if there are no operations', () => {
            const operations = [] as Operation[];

            const skipsLeft = calculateSkipsLeft(operations, 0, 1);
            expect(skipsLeft).toBe(0);
        });
    });

    describe('replayOperations', () => {
        it('should ignore operation 2, when operation 3 -> (skip=1)', () => {
            const initialState = createExtendedState<
                CountState,
                CountLocalState
            >({
                documentType: 'powerhouse/counter',
                state: { global: { count: 0 }, local: {} },
            });

            let document = createDocument<
                CountState,
                CountAction,
                CountLocalState
            >(initialState);

            document = countReducer(document, increment()); // valid operation, skip 0
            document = countReducer(document, increment()); // skipped

            document = countReducer(
                // valid operation, skip 1
                document,
                increment(),
                undefined,
                { skip: 1, ignoreSkipOperations: false },
            );

            const replayedDoc = utils.replayOperations(
                initialState,
                document.operations,
                baseCountReducer,
            );

            expect(replayedDoc.state.global.count).toBe(2);

            expect(replayedDoc.revision.global).toBe(3);
            expect(replayedDoc.operations.global.length).toBe(3);
            expect(replayedDoc.operations.global).toMatchObject([
                {
                    type: 'INCREMENT',
                    skip: 0,
                    index: 0,
                },
                {
                    type: 'INCREMENT',
                    skip: 0,
                    index: 1,
                },
                {
                    type: 'INCREMENT',
                    skip: 1,
                    index: 2,
                },
            ]);
        });

        it('should ignore operation 2, 3 and 4, when operation 5 -> (skip=3)', () => {
            const initialState = createExtendedState<
                CountState,
                CountLocalState
            >({
                documentType: 'powerhouse/counter',
                state: { global: { count: 0 }, local: {} },
            });

            let document = createDocument<
                CountState,
                CountAction,
                CountLocalState
            >(initialState);

            document = countReducer(document, increment()); // valid operation, skip 0
            document = countReducer(document, increment()); // skipped
            document = countReducer(document, increment()); // skipped
            document = countReducer(document, increment()); // skipped
            document = countReducer(
                // valid operation, skip 3
                document,
                increment(),
                undefined,
                { skip: 3, ignoreSkipOperations: true },
            );

            const replayedDoc = utils.replayOperations(
                initialState,
                document.operations,
                baseCountReducer,
            );

            expect(replayedDoc.state.global.count).toBe(2);

            expect(replayedDoc.revision.global).toBe(5);
            expect(replayedDoc.operations.global.length).toBe(5);
            expect(replayedDoc.operations.global).toMatchObject([
                {
                    type: 'INCREMENT',
                    skip: 0,
                    index: 0,
                },
                {
                    type: 'INCREMENT',
                    skip: 0,
                    index: 1,
                },
                {
                    type: 'INCREMENT',
                    skip: 0,
                    index: 2,
                },
                {
                    type: 'INCREMENT',
                    skip: 0,
                    index: 3,
                },
                {
                    type: 'INCREMENT',
                    skip: 3,
                    index: 4,
                },
            ]);
        });

        it('should ignore operation 2 and 5, when operation 3 -> (skip=1) and operation 6 -> (skip=1)', () => {
            const initialState = createExtendedState<
                CountState,
                CountLocalState
            >({
                documentType: 'powerhouse/counter',
                state: { global: { count: 0 }, local: {} },
            });

            let document = createDocument<
                CountState,
                CountAction,
                CountLocalState
            >(initialState);

            document = countReducer(document, increment()); // valid operation, skip 0
            document = countReducer(document, increment()); // skipped
            document = countReducer(
                // valid operation, skip 1
                document,
                increment(),
                undefined,
                { skip: 1, ignoreSkipOperations: true },
            );
            document = countReducer(document, increment()); // valid operation, skip 0
            document = countReducer(document, increment()); // skipped
            document = countReducer(
                // valid operation, skip 1
                document,
                increment(),
                undefined,
                { skip: 1, ignoreSkipOperations: true },
            );

            const replayedDoc = utils.replayOperations(
                initialState,
                document.operations,
                baseCountReducer,
            );

            expect(replayedDoc.state.global.count).toBe(4);

            expect(replayedDoc.revision.global).toBe(6);
            expect(replayedDoc.operations.global.length).toBe(6);

            expect(replayedDoc.operations.global).toMatchObject([
                {
                    type: 'INCREMENT',
                    skip: 0,
                    index: 0,
                },
                {
                    type: 'INCREMENT',
                    skip: 0,
                    index: 1,
                },
                {
                    type: 'INCREMENT',
                    skip: 1,
                    index: 2,
                },
                {
                    type: 'INCREMENT',
                    skip: 0,
                    index: 3,
                },
                {
                    type: 'INCREMENT',
                    skip: 0,
                    index: 4,
                },
                {
                    type: 'INCREMENT',
                    skip: 1,
                    index: 5,
                },
            ]);
        });

        it('should ignore all the previous operations, when operation 5 -> (skip=4)', () => {
            const initialState = createExtendedState<
                CountState,
                CountLocalState
            >({
                documentType: 'powerhouse/counter',
                state: { global: { count: 0 }, local: {} },
            });

            let document = createDocument<
                CountState,
                CountAction,
                CountLocalState
            >(initialState);

            document = countReducer(document, increment()); // skipped
            document = countReducer(document, increment()); // skipped
            document = countReducer(document, increment()); // skipped
            document = countReducer(document, increment()); // skipped
            document = countReducer(
                // valid operation, skip 4
                document,
                increment(),
                undefined,
                { skip: 4, ignoreSkipOperations: true },
            );

            const replayedDoc = utils.replayOperations(
                initialState,
                document.operations,
                baseCountReducer,
            );

            expect(replayedDoc.state.global.count).toBe(1);

            expect(replayedDoc.revision.global).toBe(5);
            expect(replayedDoc.operations.global.length).toBe(5);

            expect(replayedDoc.operations.global).toMatchObject([
                {
                    type: 'INCREMENT',
                    skip: 0,
                    index: 0,
                },
                {
                    type: 'INCREMENT',
                    skip: 0,
                    index: 1,
                },
                {
                    type: 'INCREMENT',
                    skip: 0,
                    index: 2,
                },
                {
                    type: 'INCREMENT',
                    skip: 0,
                    index: 3,
                },
                {
                    type: 'INCREMENT',
                    skip: 4,
                    index: 4,
                },
            ]);
        });

        // TODO: handle skip head operations in replayOperations
        it.skip('should skip the latest 2 operations from global scope ops when skipHeaderOperations is defined', () => {
            const initialState = createExtendedState<
                CountState,
                CountLocalState
            >({
                documentType: 'powerhouse/counter',
                state: { global: { count: 0 }, local: {} },
            });

            let document = createDocument<
                CountState,
                CountAction,
                CountLocalState
            >(initialState);

            document = countReducer(document, increment());
            document = countReducer(document, increment());
            document = countReducer(document, increment());
            document = countReducer(document, increment());
            document = countReducer(document, increment());

            const replayedDoc = utils.replayOperations(
                initialState,
                document.operations,
                baseCountReducer,
                undefined,
                undefined,
                undefined,
                { global: 2 },
            );

            expect(replayedDoc.state.global.count).toBe(3);

            expect(replayedDoc.revision.global).toBe(5);
            expect(replayedDoc.operations.global.length).toBe(5);
            expect(replayedDoc.operations.global[3]).toHaveProperty(
                'type',
                'NOOP',
            );
            expect(replayedDoc.operations.global[4]).toHaveProperty(
                'type',
                'NOOP',
            );
        });

        it('should skip operations when dispatch a new action with an skip value', () => {
            const initialState = createExtendedState<
                CountState,
                CountLocalState
            >({
                documentType: 'powerhouse/counter',
                state: { global: { count: 0 }, local: {} },
            });

            let document = createDocument<
                CountState,
                CountAction,
                CountLocalState
            >(initialState);

            document = countReducer(document, increment());
            document = countReducer(document, increment());
            document = countReducer(document, increment(), undefined, {
                skip: 1,
            });
            document = countReducer(document, increment());
            document = countReducer(document, increment(), undefined, {
                skip: 1,
            });

            expect(document.state.global.count).toBe(3);
            expect(document.operations.global.length).toBe(5);

            expect(document.operations.global).toMatchObject([
                {
                    type: 'INCREMENT',
                    skip: 0,
                    index: 0,
                },
                {
                    type: 'INCREMENT',
                    skip: 0,
                    index: 1,
                },
                {
                    type: 'INCREMENT',
                    skip: 1,
                    index: 2,
                },
                {
                    type: 'INCREMENT',
                    skip: 0,
                    index: 3,
                },
                {
                    type: 'INCREMENT',
                    skip: 1,
                    index: 4,
                },
            ]);
        });
    });
});
