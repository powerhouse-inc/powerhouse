import { SET_NAME, createDocument, prune, setName } from '../../src';
import {
    CountAction,
    CountState,
    countReducer,
    emptyReducer,
    increment,
} from '../helpers';

describe('Base reducer', () => {
    it('should update revision', async () => {
        const state = createDocument();
        const newState = emptyReducer(state, { type: 'TEST' });
        expect(newState.revision).toBe(1);
    });

    it('should update lastModified', async () => {
        jest.useFakeTimers();
        const state = createDocument();
        await new Promise(r => {
            setTimeout(r, 100);
            jest.runOnlyPendingTimers();
        });
        const newState = emptyReducer(state, { type: 'TEST' });
        expect(newState.lastModified > state.lastModified).toBe(true);
        jest.useRealTimers();
    });

    it('should update operations list', async () => {
        const state = createDocument();
        const newState = emptyReducer(state, { type: 'TEST' });
        expect(newState.operations).toStrictEqual([{ type: 'TEST', index: 0 }]);
    });

    it('should create SET_NAME action', () => {
        const setNameAction = setName('Document');
        expect(setNameAction).toStrictEqual({
            type: SET_NAME,
            input: 'Document',
        });
    });

    it('should set document name', async () => {
        const state = createDocument();
        const newState = emptyReducer(state, setName('Document'));
        expect(newState.name).toBe('Document');
    });

    it('should prune operations history', async () => {
        const state = createDocument<CountState, CountAction>({
            data: { count: 0 },
        });
        let newState = countReducer(state, increment());
        newState = countReducer(newState, setName('Document'));
        newState = countReducer(newState, increment());
        newState = countReducer(newState, increment());
        newState = countReducer(newState, increment());
        newState = countReducer(newState, prune(4));

        expect(newState.name).toBe('Document');
        expect(newState.data.count).toBe(4);
        expect(newState.operations).toStrictEqual([
            { ...increment(), index: 0 },
        ]);
        expect(newState.initialData).toStrictEqual({ count: 3 });
    });
});
