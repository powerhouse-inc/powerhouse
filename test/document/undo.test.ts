import { setName, undo } from '../../src/document/actions';
import { createDocument } from '../../src/document/utils';
import {
    CountAction,
    countReducer,
    CountState,
    emptyReducer,
    increment,
    mapOperations,
} from '../helpers';

describe('UNDO operation', () => {
    it('should undo last operation', () => {
        let state = createDocument();
        state = emptyReducer(state, setName('TEST_1'));
        expect(state.revision).toBe(1);

        state = emptyReducer(state, undo(1));

        expect(mapOperations(state.operations)).toStrictEqual([
            { ...setName('TEST_1'), index: 0 },
        ]);
        expect(state.name).toBe('');
        expect(state.revision).toBe(0);
    });

    it('should undo multiple operations', () => {
        let state = createDocument();
        state = emptyReducer(state, setName('TEST_1'));
        state = emptyReducer(state, setName('TEST_2'));
        expect(state.revision).toBe(2);

        state = emptyReducer(state, undo(2));
        expect(mapOperations(state.operations)).toStrictEqual([
            { ...setName('TEST_1'), index: 0 },
            { ...setName('TEST_2'), index: 1 },
        ]);
        expect(state.revision).toBe(0);
    });

    it('should undo only existing operations', () => {
        let state = createDocument();
        state = emptyReducer(state, setName('TEST_1'));
        state = emptyReducer(state, setName('TEST_2'));
        state = emptyReducer(state, undo(5));
        expect(mapOperations(state.operations)).toStrictEqual([
            { ...setName('TEST_1'), index: 0 },
            { ...setName('TEST_2'), index: 1 },
        ]);
        expect(state.name).toBe('');
        expect(state.revision).toBe(0);
    });

    it('should clear undone operations when there is a new operation', () => {
        let state = createDocument();
        state = emptyReducer(state, setName('TEST_1'));
        state = emptyReducer(state, undo(1));
        state = emptyReducer(state, setName('TEST_2'));
        expect(mapOperations(state.operations)).toStrictEqual([
            { ...setName('TEST_2'), index: 0 },
        ]);
        expect(state.name).toBe('TEST_2');
        expect(state.revision).toBe(1);
    });

    it('should undo the last UNDO operation', () => {
        let state = createDocument();
        state = emptyReducer(state, setName('TEST_1'));
        state = emptyReducer(state, undo(1));
        state = emptyReducer(state, setName('TEST_2'));
        state = emptyReducer(state, undo(1));
        expect(mapOperations(state.operations)).toStrictEqual([
            { ...setName('TEST_2'), index: 0 },
        ]);
        expect(state.name).toBe('');
        expect(state.revision).toBe(0);
    });

    it('should keep document attributes', () => {
        let state = createDocument<CountState, CountAction>({
            documentType: 'powerhouse/counter',
            state: { count: 0 },
        });
        state = countReducer(state, increment());
        state = countReducer(state, undo(1));
        expect(state.state.count).toBe(0);
        expect(state.documentType).toBe('powerhouse/counter');
    });
});
