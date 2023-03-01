import {
    UNDO,
    _getActionsToApplyWithUndo,
    createDocument,
    setName,
    undo,
} from '../../src';
import { emptyReducer } from '../helpers';

describe('UNDO operation', () => {
    it('should undo last operation', () => {
        const operations = _getActionsToApplyWithUndo(
            [{ type: 'TEST_1' }, { type: 'TEST_2' }],
            1
        );
        expect(operations).toStrictEqual([{ type: 'TEST_1' }]);
    });

    it('should undo two operations', () => {
        const operations = _getActionsToApplyWithUndo(
            [{ type: 'TEST_1' }, { type: 'TEST_2' }],
            2
        );
        expect(operations).toStrictEqual([]);
    });

    it('should undo operations up to count', () => {
        const operations = _getActionsToApplyWithUndo(
            [{ type: 'TEST_1' }, { type: 'TEST_2' }],
            5
        );
        expect(operations).toStrictEqual([]);
    });

    it('should apply previous undo operations', () => {
        const operations = _getActionsToApplyWithUndo(
            [
                { type: 'TEST_1' },
                { type: 'TEST_2' },
                undo(1),
                { type: 'TEST_3' },
            ],
            1
        );
        expect(operations).toStrictEqual([{ type: 'TEST_1' }]);
    });

    it('should support undo on composed reducer', () => {
        let state = createDocument();
        state = emptyReducer(state, { type: 'TEST_1' });
        state = emptyReducer(state, { type: 'TEST_2' });
        state = emptyReducer(state, undo(1));
        expect(state.operations).toStrictEqual([
            { type: 'TEST_1', index: 0 },
            { type: 'TEST_2', index: 1 },
            { type: UNDO, input: 1, index: 2 },
        ]);
    });

    it('should undo SET_NAME operations', () => {
        let state = createDocument();
        state = emptyReducer(state, setName('TEST_1'));
        state = emptyReducer(state, setName('TEST_2'));
        state = emptyReducer(state, undo(1));
        expect(state.operations).toStrictEqual([
            { ...setName('TEST_1'), index: 0 },
            { ...setName('TEST_2'), index: 1 },
            { type: UNDO, input: 1, index: 2 },
        ]);
        expect(state.name).toBe('TEST_1');
    });
});
