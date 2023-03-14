import { createDocument, redo, setName, undo } from '../../src';
import { emptyReducer } from '../helpers';

describe('REDO operation', () => {
    it('should redo previous UNDO operation', () => {
        let state = createDocument();
        state = emptyReducer(state, setName('TEST_1'));
        state = emptyReducer(state, undo(1));
        state = emptyReducer(state, redo(1));

        expect(state.name).toBe('TEST_1');
        expect(state.operations).toStrictEqual([
            { ...setName('TEST_1'), index: 0 },
        ]);
        expect(state.revision).toBe(1);
    });

    it('should remove multiple UNDO operations', () => {
        let state = createDocument();
        state = emptyReducer(state, setName('TEST_1'));
        state = emptyReducer(state, setName('TEST_2'));
        state = emptyReducer(state, undo(1));
        state = emptyReducer(state, undo(1));
        state = emptyReducer(state, redo(2));

        expect(state.name).toBe('TEST_2');
        expect(state.operations).toStrictEqual([
            { ...setName('TEST_1'), index: 0 },
            { ...setName('TEST_2'), index: 1 },
        ]);
        expect(state.revision).toBe(2);
    });

    it('should remove UNDO operations up to count', () => {
        let state = createDocument();
        state = emptyReducer(state, setName('TEST_1'));
        state = emptyReducer(state, setName('TEST_2'));
        state = emptyReducer(state, undo(2));
        state = emptyReducer(state, redo(1));

        expect(state.name).toBe('TEST_1');
        expect(state.operations).toStrictEqual([
            { ...setName('TEST_1'), index: 0 },
            { ...setName('TEST_2'), index: 1 },
        ]);
        expect(state.revision).toBe(1);
    });

    it('should support multiple redo operations', () => {
        let state = createDocument();
        state = emptyReducer(state, setName('TEST_1'));
        state = emptyReducer(state, setName('TEST_2'));
        state = emptyReducer(state, undo(2));
        state = emptyReducer(state, redo(1));
        state = emptyReducer(state, redo(1));

        expect(state.name).toBe('TEST_2');
        expect(state.operations).toStrictEqual([
            { ...setName('TEST_1'), index: 0 },
            { ...setName('TEST_2'), index: 1 },
        ]);
        expect(state.revision).toBe(2);
    });

    it('should redo all UNDO operations up to count', () => {
        let state = createDocument();
        state = emptyReducer(state, setName('TEST_1'));
        state = emptyReducer(state, setName('TEST_2'));
        state = emptyReducer(state, undo(2));
        state = emptyReducer(state, redo(5));

        expect(state.name).toBe('TEST_2');
        expect(state.operations).toStrictEqual([
            { ...setName('TEST_1'), index: 0 },
            { ...setName('TEST_2'), index: 1 },
        ]);
        expect(state.revision).toBe(2);
    });

    it('should redo the latest UNDO operation', () => {
        let state = createDocument();
        state = emptyReducer(state, setName('TEST_1'));
        state = emptyReducer(state, undo(1));
        state = emptyReducer(state, setName('TEST_2'));
        state = emptyReducer(state, undo(1));
        state = emptyReducer(state, redo(1));
        expect(state.operations).toStrictEqual([
            { ...setName('TEST_2'), index: 0 },
        ]);
        expect(state.name).toBe('TEST_2');
        expect(state.revision).toBe(1);
    });

    it("should throw error when last operation isn't UNDO", () => {
        let state = createDocument();
        state = emptyReducer(state, setName('TEST_1'));
        expect(() => emptyReducer(state, redo(1))).toThrow();
    });

    it('should throw error when there are no operations', () => {
        const state = createDocument();
        expect(() => emptyReducer(state, redo(1))).toThrow();
    });
});
