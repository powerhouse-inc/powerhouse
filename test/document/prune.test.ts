import {
    loadState,
    prune,
    redo,
    setName,
    undo,
} from '../../src/document/actions';
import { createDocument } from '../../src/document/utils';
import {
    CountAction,
    countReducer,
    CountState,
    increment,
    mapOperations,
} from '../helpers';

describe('PRUNE operation', () => {
    it('should prune first 4 operations', async () => {
        const state = createDocument<CountState, CountAction>({
            documentType: 'powerhouse/counter',
            state: { count: 0 },
        });
        let newState = countReducer(state, increment());
        newState = countReducer(newState, setName('Document'));
        newState = countReducer(newState, increment());
        newState = countReducer(newState, increment());
        newState = countReducer(newState, increment());
        newState = countReducer(newState, prune(0, 4));

        expect(newState.name).toBe('Document');
        expect(newState.state.count).toBe(4);
        expect(newState.revision).toBe(2);
        expect(mapOperations(newState.operations)).toStrictEqual([
            {
                ...loadState(
                    {
                        name: 'Document',
                        state: { count: 3 },
                    },
                    4
                ),
                index: 0,
            },
            { ...increment(), index: 1 },
        ]);
        expect(newState.documentType).toBe('powerhouse/counter');
        expect(newState.initialState.state).toStrictEqual({ count: 0 });
        expect(newState.initialState.state).toStrictEqual(state.state);
    });

    it('should prune last 3 operations', async () => {
        const state = createDocument<CountState, CountAction>({
            documentType: 'powerhouse/counter',
            state: { count: 0 },
        });
        let newState = countReducer(state, increment());
        newState = countReducer(newState, setName('Document'));
        newState = countReducer(newState, increment());
        newState = countReducer(newState, increment());
        newState = countReducer(newState, increment());
        newState = countReducer(newState, prune(2));

        expect(newState.name).toBe('Document');
        expect(newState.state.count).toBe(4);
        expect(newState.revision).toBe(3);
        expect(mapOperations(newState.operations)).toStrictEqual([
            { ...increment(), index: 0 },
            { ...setName('Document'), index: 1 },
            {
                ...loadState(
                    {
                        name: 'Document',
                        state: { count: 4 },
                    },
                    3
                ),
                index: 2,
            },
        ]);
        expect(newState.documentType).toBe('powerhouse/counter');
        expect(newState.initialState.state).toStrictEqual({ count: 0 });
        expect(newState.initialState.state).toStrictEqual(state.state);
    });

    it('should prune 2 operations', async () => {
        const state = createDocument<CountState, CountAction>({
            documentType: 'powerhouse/counter',
            state: { count: 0 },
        });
        let newState = countReducer(state, increment());
        newState = countReducer(newState, setName('Document'));
        newState = countReducer(newState, increment());
        newState = countReducer(newState, increment());
        newState = countReducer(newState, increment());
        newState = countReducer(newState, prune(2, 4));

        expect(newState.name).toBe('Document');
        expect(newState.state.count).toBe(4);
        expect(newState.revision).toBe(4);
        expect(mapOperations(newState.operations)).toStrictEqual([
            { ...increment(), index: 0 },
            { ...setName('Document'), index: 1 },
            {
                ...loadState(
                    {
                        name: 'Document',
                        state: { count: 3 },
                    },
                    2
                ),
                index: 2,
            },
            { ...increment(), index: 3 },
        ]);
        expect(newState.documentType).toBe('powerhouse/counter');
        expect(newState.initialState.state).toStrictEqual({ count: 0 });
        expect(newState.initialState.state).toStrictEqual(state.state);
    });

    it('should undo pruned state', async () => {
        const state = createDocument<CountState, CountAction>({
            documentType: 'powerhouse/counter',
            state: { count: 0 },
        });
        let newState = countReducer(state, increment());
        newState = countReducer(newState, setName('Document'));
        newState = countReducer(newState, increment());
        newState = countReducer(newState, increment());
        newState = countReducer(newState, increment());
        newState = countReducer(newState, prune(1, 5));
        newState = countReducer(newState, undo(1));

        expect(newState.name).toBe('');
        expect(newState.state.count).toBe(1);
        expect(newState.revision).toBe(1);
        expect(mapOperations(newState.operations)).toStrictEqual([
            { ...increment(), index: 0 },
            {
                ...loadState(
                    {
                        name: 'Document',
                        state: { count: 4 },
                    },
                    4
                ),
                index: 1,
            },
        ]);
        expect(newState.documentType).toBe('powerhouse/counter');
        expect(newState.initialState.state).toStrictEqual({ count: 0 });
        expect(newState.initialState.state).toStrictEqual(state.state);
    });

    it('should redo pruned state', async () => {
        const state = createDocument<CountState, CountAction>({
            documentType: 'powerhouse/counter',
            state: { count: 0 },
        });
        let newState = countReducer(state, increment());
        newState = countReducer(newState, setName('Document'));
        newState = countReducer(newState, increment());
        newState = countReducer(newState, increment());
        newState = countReducer(newState, increment());
        newState = countReducer(newState, prune(1, 5));
        newState = countReducer(newState, undo(1));
        newState = countReducer(newState, redo(1));

        expect(newState.name).toBe('Document');
        expect(newState.state.count).toBe(4);
        expect(newState.revision).toBe(2);
        expect(mapOperations(newState.operations)).toStrictEqual([
            { ...increment(), index: 0 },
            {
                ...loadState(
                    {
                        name: 'Document',
                        state: { count: 4 },
                    },
                    4
                ),
                index: 1,
            },
        ]);
        expect(newState.documentType).toBe('powerhouse/counter');
        expect(newState.initialState.state).toStrictEqual({ count: 0 });
        expect(newState.initialState.state).toStrictEqual(state.state);
    });
});
