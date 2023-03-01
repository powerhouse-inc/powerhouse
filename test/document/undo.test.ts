import { UNDO, getActionsToApplyWithUndo, initDocument, undo } from '../../src';
import { emptyReducer } from '../helpers';
describe('UNDO operation', () => {
    it('should undo last operation', async () => {
        const operations = getActionsToApplyWithUndo(
            [{ type: 'TEST_1' }, { type: 'TEST_2' }],
            1
        );
        expect(operations).toStrictEqual([{ type: 'TEST_1' }]);
    });

    it('should undo two operations', async () => {
        const operations = getActionsToApplyWithUndo(
            [{ type: 'TEST_1' }, { type: 'TEST_2' }],
            2
        );
        expect(operations).toStrictEqual([]);
    });

    it('should undo operations up to count', async () => {
        const operations = getActionsToApplyWithUndo(
            [{ type: 'TEST_1' }, { type: 'TEST_2' }],
            5
        );
        expect(operations).toStrictEqual([]);
    });

    it('should apply previous undo operations', async () => {
        const operations = getActionsToApplyWithUndo(
            [
                { type: 'TEST_1' },
                { type: 'TEST_2' },
                { type: UNDO, input: 1 },
                { type: 'TEST_3' },
            ],
            1
        );
        expect(operations).toStrictEqual([{ type: 'TEST_1' }]);
    });

    it('should support undo on composed reducer', async () => {
        let state = initDocument();
        state = emptyReducer(state, { type: 'TEST_1' });
        state = emptyReducer(state, { type: 'TEST_2' });
        state = emptyReducer(state, undo(1));
        expect(state.operations).toStrictEqual([
            { type: 'TEST_1', index: 0 },
            { type: 'TEST_2', index: 1 },
            { type: UNDO, input: 1, index: 2 },
        ]);
    });
});
