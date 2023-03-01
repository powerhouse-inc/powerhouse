import {
    createDocument,
    _getActionsToApplyWithRedo,
    undo,
    redo,
    setName,
} from '../../src';
import { emptyReducer } from '../helpers';

describe('REDO operation', () => {
    it('should redo last undone operation', () => {
        const operations = _getActionsToApplyWithRedo(
            [{ type: 'TEST_1' }, undo(1)],
            1
        );
        expect(operations).toStrictEqual([{ type: 'TEST_1' }]);
    });

    it("should throw error when last operation isn't UNDO", () => {
        expect(() =>
            _getActionsToApplyWithRedo([{ type: 'TEST_1' }], 1)
        ).toThrow();
    });

    it('should throw error when there are no operations', () => {
        expect(() => _getActionsToApplyWithRedo([], 1)).toThrow();
    });

    it('should redo operations up to count', () => {
        const operations = _getActionsToApplyWithRedo(
            [
                { type: 'TEST_1' },
                { type: 'TEST_2' },
                { type: 'TEST_3' },
                undo(3),
            ],
            2
        );
        expect(operations).toStrictEqual([
            { type: 'TEST_1' },
            { type: 'TEST_2' },
        ]);
    });

    it('should redo all UNDO operations up to count', () => {
        const operations = _getActionsToApplyWithRedo(
            [{ type: 'TEST_1' }, { type: 'TEST_2' }, undo(1), undo(1)],
            5
        );
        expect(operations).toStrictEqual([
            { type: 'TEST_1' },
            { type: 'TEST_2' },
        ]);
    });

    it('should support redo on composed reducer', () => {
        let state = createDocument();
        state = emptyReducer(state, { type: 'TEST_1' });
        state = emptyReducer(state, { type: 'TEST_2' });
        state = emptyReducer(state, undo(1));
        state = emptyReducer(state, redo(1));
        expect(state.operations).toStrictEqual([
            { type: 'TEST_1', index: 0 },
            { type: 'TEST_2', index: 1 },
        ]);
    });

    it('should remove UNDO operations up to count', () => {
        let state = createDocument();
        state = emptyReducer(state, { type: 'TEST_1' });
        state = emptyReducer(state, { type: 'TEST_2' });
        state = emptyReducer(state, undo(1));
        state = emptyReducer(state, undo(1));
        state = emptyReducer(state, redo(2));
        expect(state.operations).toStrictEqual([
            { type: 'TEST_1', index: 0 },
            { type: 'TEST_2', index: 1 },
        ]);
    });

    it('should redo SET_NAME', () => {
        let state = createDocument();
        state = emptyReducer(state, setName('TEST_1'));
        state = emptyReducer(state, setName('TEST_2'));
        state = emptyReducer(state, undo(1));
        state = emptyReducer(state, redo(1));
        expect(state.name).toBe('TEST_2');
    });
});
