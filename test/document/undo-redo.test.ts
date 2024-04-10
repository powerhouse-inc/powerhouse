import { noop, undo, redo } from '../../src/document/actions';
import { createDocument, createExtendedState } from '../../src/document/utils';
import { processUndoRedo } from '../../src/document/reducer';
import { Document, Operation } from '../../src/document/types';
import {
    CountState,
    CountAction,
    CountLocalState,
    countReducer,
    increment,
} from '../helpers';

describe('UNDO/REDO', () => {
    let document: Document<CountState, CountAction, CountLocalState>;

    beforeEach(() => {
        const initialState = createExtendedState<CountState, CountLocalState>({
            documentType: 'powerhouse/counter',
            state: { global: { count: 0 }, local: {} },
        });

        document = createDocument<CountState, CountAction, CountLocalState>(
            initialState,
        );

        document = countReducer(document, increment());
        document = countReducer(document, increment());
        document = countReducer(document, increment());
        document = countReducer(document, increment());
        document = countReducer(document, increment());
    });

    describe('processUndoRedo -> UNDO', () => {
        it('should return a NOOP action when an UNDO action is dispatched', () => {
            const skip = 0;
            const undoAction = undo(1);
            const result = processUndoRedo(document, undoAction, skip);

            expect(result.action.type).toBe('NOOP');
        });

        it("should return skip = undo value if there's no skip value passed to the reducer", () => {
            const skip = 0;
            const undoAction = undo(2);
            const result = processUndoRedo(document, undoAction, skip);

            expect(result.skip).toBe(2);
            expect(result.action.type).toBe('NOOP');
        });

        it('should return skip = undo value + previous NOOP skip value, when latest action is NOOP with skip > 0', () => {
            const skip = 0;
            const undoAction = undo(2);

            document = countReducer(document, noop(), undefined, {
                skip: 3,
                ignoreSkipOperations: true,
            });
            const result = processUndoRedo(document, undoAction, skip);

            expect(result.skip).toBe(5);
            expect(result.action.type).toBe('NOOP');
        });

        it('should remove latest operation if is a NOOP with skip > 0', () => {
            const skip = 0;
            const undoAction = undo(1);

            document = countReducer(document, noop(), undefined, {
                skip: 2,
                ignoreSkipOperations: true,
            });
            const result = processUndoRedo(document, undoAction, skip);

            expect(result.skip).toBe(3);
            expect(result.document.operations.global.length).toBe(5);
            expect(result.document.operations.global[4].type).toBe('INCREMENT');
            expect(result.action.type).toBe('NOOP');
        });

        it('should NOT remove latest operation if !== NOOP', () => {
            const skip = 0;
            const undoAction = undo(1);
            const result = processUndoRedo(document, undoAction, skip);

            expect(result.skip).toBe(1);
            expect(result.document.operations.global.length).toBe(5);
            expect(result.document.operations.global[4].type).toBe('INCREMENT');
        });

        it('should NOT remove latest operation if is a NOOP with skip = 0', () => {
            const skip = 0;
            const undoAction = undo(1);

            document = countReducer(document, noop(), undefined, {
                skip: 0,
                ignoreSkipOperations: true,
            });
            const result = processUndoRedo(document, undoAction, skip);

            expect(result.skip).toBe(1);
            expect(result.document.operations.global.length).toBe(6);
            expect(result.document.operations.global[5].type).toBe('NOOP');
        });

        it('should add to the clipboard the undone operations', () => {
            const skip = 0;
            const undoAction = undo(4);
            const result = processUndoRedo(document, undoAction, skip);

            expect(result.document.clipboard).toMatchObject([
                {
                    type: 'INCREMENT',
                    input: undefined,
                    scope: 'global',
                    skip: 0,
                    index: 4,
                },
                {
                    type: 'INCREMENT',
                    input: undefined,
                    scope: 'global',
                    skip: 0,
                    index: 3,
                },
                {
                    type: 'INCREMENT',
                    input: undefined,
                    scope: 'global',
                    skip: 0,
                    index: 2,
                },
                {
                    type: 'INCREMENT',
                    input: undefined,
                    scope: 'global',
                    skip: 0,
                    index: 1,
                },
            ]);
        });

        it('should not cosider previous undone operations when adding to the clipboard', () => {
            const skip = 0;
            const undoAction = undo(2);

            document = countReducer(document, noop(), undefined, {
                skip: 2,
                ignoreSkipOperations: true,
            });
            const result = processUndoRedo(document, undoAction, skip);

            expect(result.document.clipboard).toMatchObject([
                {
                    type: 'INCREMENT',
                    input: undefined,
                    scope: 'global',
                    skip: 0,
                    index: 2,
                },
                {
                    type: 'INCREMENT',
                    input: undefined,
                    scope: 'global',
                    skip: 0,
                    index: 1,
                },
            ]);
        });

        it('should continue undoing the latest valid opration if an UNDO action overlaps with a previous one', () => {
            const skip = 0;
            const undoAction = undo(2);

            document = countReducer(document, noop(), undefined, {
                skip: 2,
                ignoreSkipOperations: true,
            });
            document = countReducer(document, increment());

            const result = processUndoRedo(document, undoAction, skip);

            expect(result.skip).toBe(5);
            expect(result.document.clipboard).toMatchObject([
                {
                    type: 'INCREMENT',
                    input: undefined,
                    scope: 'global',
                    skip: 0,
                    index: 6,
                },
                {
                    type: 'INCREMENT',
                    input: undefined,
                    scope: 'global',
                    skip: 0,
                    index: 2,
                },
            ]);
        });

        it('should throw an error if an undo actions is dispatched along with an skip value from the reducer', () => {
            const skip = 1;
            const undoAction = undo(1);
            const throwErrorFunc = () =>
                processUndoRedo(document, undoAction, skip);

            expect(throwErrorFunc).toThrow(
                'Cannot undo: skip value from reducer cannot be used with UNDO action',
            );
        });

        it('should throw an error if you try to undone more operations than the ones available', () => {
            const skip = 0;
            const undoAction = undo(10);
            const throwErrorFunc = () =>
                processUndoRedo(document, undoAction, skip);

            expect(throwErrorFunc).toThrow(
                "Cannot undo: you can't undo more operations than the ones in the scope history",
            );
        });

        it('should throw an error if you dispatch an undo action with a negative value', () => {
            const skip = 0;
            const undoAction = undo(-1);
            const throwErrorFunc = () =>
                processUndoRedo(document, undoAction, skip);

            expect(throwErrorFunc).toThrow(
                'Invalid UNDO action: input value must be greater than 0',
            );
        });

        it('should throw an error if you dispatch an undo action in a document with no operations in the scope history', () => {
            const skip = 0;
            const undoAction = undo(1);
            const emptyDocument = createDocument<
                CountState,
                CountAction,
                CountLocalState
            >(
                createExtendedState<CountState, CountLocalState>({
                    documentType: 'powerhouse/counter',
                    state: { global: { count: 0 }, local: {} },
                }),
            );

            const throwErrorFunc = () =>
                processUndoRedo(emptyDocument, undoAction, skip);

            expect(throwErrorFunc).toThrow(
                'Cannot undo: no operations in history for scope "global"',
            );
        });
    });

    describe('processUndoRedo -> REDO', () => {
        it("should throw an error when there's no operation to redo in the clipboard", () => {
            const initialState = createExtendedState<
                CountState,
                CountLocalState
            >({
                documentType: 'powerhouse/counter',
                state: { global: { count: 0 }, local: {} },
            });

            document = createDocument<CountState, CountAction, CountLocalState>(
                initialState,
            );

            const skip = 0;
            const redoAction = redo(1);
            const throwErrorFunc = () =>
                processUndoRedo(document, redoAction, skip);

            expect(throwErrorFunc).toThrow(
                'Cannot redo: no operations in the clipboard',
            );
        });

        it('should throw an error if you try to redo more than 1 operation', () => {
            const skip = 0;
            const redoAction = redo(2);
            const throwErrorFunc = () =>
                processUndoRedo(document, redoAction, skip);

            expect(throwErrorFunc).toThrow(
                'Cannot redo: you can only redo one operation at a time',
            );
        });

        it('should throw an error if you try to redo with an skip value', () => {
            const skip = 1;
            const redoAction = redo(1);
            const throwErrorFunc = () =>
                processUndoRedo(document, redoAction, skip);

            expect(throwErrorFunc).toThrow(
                'Cannot redo: skip value from reducer cannot be used with REDO action',
            );
        });

        it("should throw an error if there's no operations for the scope in the clipboard", () => {
            const skip = 0;
            const redoAction = redo(1, 'local');

            document = countReducer(document, undo(1));

            const throwErrorFunc = () =>
                processUndoRedo(document, redoAction, skip);
            expect(throwErrorFunc).toThrow(
                'Cannot redo: no operations in clipboard for scope "local"',
            );
        });

        it('should transform REDO action into the latest valid action stored in the clipboard', () => {
            const skip = 0;
            const redoAction = redo(1);

            document = countReducer(document, undo(1));
            const result = processUndoRedo(document, redoAction, skip);

            expect(result.action.type).toBe('INCREMENT');
            expect(result.action.scope).toBe('global');
            expect(result.action.input).toBe(undefined);
        });

        it('should remove the latest valid action from the clipboard', () => {
            const skip = 0;
            const redoAction = redo(1);

            document = countReducer(document, undo(1));
            expect(document.clipboard.length).toBe(1);

            const result = processUndoRedo(document, redoAction, skip);

            expect(result.document.clipboard.length).toBe(0);
        });
    });

    describe('UNDO', () => {
        it('should undo operations', () => {
            document = countReducer(document, undo(1));

            expect(document.revision.global).toBe(6);
            expect(document.state.global.count).toBe(4);

            expect(document.clipboard.length).toBe(1);
            expect(document.clipboard[0].type).toBe('INCREMENT');
            expect(document.clipboard[0].index).toBe(4);

            expect(document.operations.global.length).toBe(6);
            expect(document.operations.global[5]).toMatchObject({
                type: 'NOOP',
                index: 5,
                skip: 1,
            });
            expect(document.operations.global[4]).toMatchObject({
                type: 'NOOP',
                index: 4,
                skip: 0,
            });
            expect(document.operations.global[3]).toMatchObject({
                type: 'INCREMENT',
                index: 3,
            });
        });

        it('should increase skip value of a previous undo Operation', () => {
            document = countReducer(document, undo(1));
            document = countReducer(document, undo(2));

            expect(document.revision.global).toBe(6);
            expect(document.state.global.count).toBe(2);

            expect(document.clipboard.length).toBe(3);
            expect(document.clipboard[0].type).toBe('INCREMENT');
            expect(document.clipboard[0].index).toBe(4);
            expect(document.clipboard[1].type).toBe('INCREMENT');
            expect(document.clipboard[1].index).toBe(3);
            expect(document.clipboard[2].type).toBe('INCREMENT');
            expect(document.clipboard[2].index).toBe(2);

            console.log(document.operations.global);

            expect(document.operations.global.length).toBe(6);
            expect(document.operations.global[5]).toMatchObject({
                type: 'NOOP',
                index: 5,
                skip: 3,
            });
            expect(document.operations.global[4]).toMatchObject({
                type: 'NOOP',
                index: 4,
                skip: 0,
            });
            expect(document.operations.global[3]).toMatchObject({
                type: 'NOOP',
                index: 3,
                skip: 0,
            });
            expect(document.operations.global[2]).toMatchObject({
                type: 'NOOP',
                index: 2,
                skip: 0,
            });
            expect(document.operations.global[1]).toMatchObject({
                type: 'INCREMENT',
                index: 1,
            });
        });

        it('should undo the latest valid operation if undo overlaps with a previous undo operation', () => {
            document = countReducer(document, undo(3));
            document = countReducer(document, increment());
            document = countReducer(document, increment());
            document = countReducer(document, undo(3));

            expect(document.revision.global).toBe(9);
            expect(document.state.global.count).toBe(1);

            expect(document.clipboard.length).toBe(3);
            expect(document.clipboard[0].type).toBe('INCREMENT');
            expect(document.clipboard[0].index).toBe(7);
            expect(document.clipboard[1].type).toBe('INCREMENT');
            expect(document.clipboard[1].index).toBe(6);
            expect(document.clipboard[2].type).toBe('INCREMENT');
            expect(document.clipboard[2].index).toBe(1);

            expect(document.operations.global.length).toBe(9);
            document.operations.global.forEach((operation, index) => {
                if (index === 0) {
                    expect(operation.type).toBe('INCREMENT');
                } else {
                    expect(operation.type).toBe('NOOP');
                }
            });
        });

        it('should undo the latest valid operation if undo overlaps with 2 previous undo operations', () => {
            document = countReducer(document, undo(1));
            document = countReducer(document, increment());
            document = countReducer(document, undo(2));
            document = countReducer(document, increment());
            document = countReducer(document, undo(2));

            expect(document.revision.global).toBe(10);
            expect(document.state.global.count).toBe(2);

            expect(document.clipboard.length).toBe(2);
            expect(document.clipboard[0].type).toBe('INCREMENT');
            expect(document.clipboard[0].index).toBe(8);
            expect(document.clipboard[1].type).toBe('INCREMENT');
            expect(document.clipboard[1].index).toBe(2);

            expect(document.operations.global.length).toBe(10);
            document.operations.global.forEach((operation, index) => {
                if (index === 0 || index === 1) {
                    expect(operation.type).toBe('INCREMENT');
                } else {
                    expect(operation.type).toBe('NOOP');
                }
            });
        });
    });

    describe('REDO', () => {
        it('should redo the latest operation', () => {
            document = countReducer(document, undo(2));
            document = countReducer(document, redo(1));

            expect(document.revision.global).toBe(7);
            expect(document.state.global.count).toBe(4);
            expect(document.operations.global.length).toBe(7);
            expect(document.clipboard.length).toBe(1);
            expect(document.operations.global[6]).toMatchObject({
                type: 'INCREMENT',
                index: 6,
            });
        });

        it('should revert document state to the latest state before applying an undo', () => {
            document = countReducer(document, undo(2));
            document = countReducer(document, redo(1));
            document = countReducer(document, redo(1));

            expect(document.revision.global).toBe(8);
            expect(document.state.global.count).toBe(5);
            expect(document.operations.global.length).toBe(8);
            expect(document.clipboard.length).toBe(0);
            expect(document.operations.global[7]).toMatchObject({
                type: 'INCREMENT',
                index: 7,
                skip: 0,
            });
            expect(document.operations.global[6]).toMatchObject({
                type: 'INCREMENT',
                index: 6,
                skip: 0,
            });
            expect(document.operations.global[5]).toMatchObject({
                type: 'NOOP',
                index: 5,
                skip: 2,
            });
            expect(document.operations.global[4]).toMatchObject({
                type: 'NOOP',
                index: 4,
                skip: 0,
            });
            expect(document.operations.global[3]).toMatchObject({
                type: 'NOOP',
                index: 3,
                skip: 0,
            });
        });

        it("should clean clipboard after applying an action that's not UNDO/REDO", () => {
            document = countReducer(document, undo(2));
            document = countReducer(document, increment());

            expect(document.revision.global).toBe(7);
            expect(document.state.global.count).toBe(4);
            expect(document.operations.global.length).toBe(7);
            expect(document.clipboard.length).toBe(0);
        });
    });

    describe('NOOP operations', () => {
        it('should apply NOOP operations', () => {
            const op: Operation = {
                input: undefined,
                type: 'NOOP',
                skip: 1,
                index: 5,
                scope: 'global',
                hash: 'Ki38EB6gkUcnU3ceRsc88njPo3U=',
                timestamp: new Date().toISOString(),
            };

            document = countReducer(document, op as CountAction, undefined);

            expect(document.revision.global).toBe(6);
            expect(document.state.global.count).toBe(4);
            expect(document.operations.global.length).toBe(6);
            expect(document.operations.global[5]).toMatchObject({
                type: 'NOOP',
                index: 5,
                skip: 1,
            });
        });

        it('should replace previous noop operation and update skip number when a new noop is dispatched after another one', () => {
            const baseOperation: Operation = {
                input: undefined,
                type: 'NOOP',
                skip: 0,
                index: 5,
                scope: 'global',
                hash: 'Ki38EB6gkUcnU3ceRsc88njPo3U=',
                timestamp: new Date().toISOString(),
            };

            const op1 = { ...baseOperation, skip: 1 } as CountAction;
            const op2 = { ...baseOperation, skip: 2 } as CountAction;
            const op3 = { ...baseOperation, skip: 3 } as CountAction;

            document = countReducer(document, op1, undefined);
            document = countReducer(document, op2, undefined);
            document = countReducer(document, op3, undefined);

            expect(document.revision.global).toBe(6);
            expect(document.state.global.count).toBe(2);
            expect(document.operations.global.length).toBe(6);
            expect(document.operations.global[5]).toMatchObject({
                type: 'NOOP',
                index: 5,
                skip: 3,
            });
        });

        it('NOOP operation should not add skipped operation to the clipboard', () => {
            const op: Operation = {
                input: undefined,
                type: 'NOOP',
                skip: 1,
                index: 5,
                scope: 'global',
                hash: 'Ki38EB6gkUcnU3ceRsc88njPo3U=',
                timestamp: new Date().toISOString(),
            };

            document = countReducer(document, op as CountAction, undefined);

            expect(document.clipboard.length).toBe(0);
        });
    });
});
