import { SET_NAME, baseReducer, initDocument, setName } from '../src/';

describe('Base reducer', () => {
    it('should create SET_NAME action', () => {
        const setNameAction = setName('Document');
        expect(setNameAction.type).toBe(SET_NAME);
        expect(setNameAction.input).toBe('Document');
    });

    it('should set document name', async () => {
        const setNameAction = setName('Document');
        const state = initDocument();
        const newState = baseReducer(state, setNameAction);
        expect(newState.name).toBe('Document');
    });

    it('should update revision', async () => {
        const setNameAction = setName('Document');
        const state = initDocument();
        const newState = baseReducer(state, setNameAction);
        expect(newState.revision).toBe(1);
    });

    it('should update lastModified', async () => {
        const setNameAction = setName('Document');
        const state = initDocument();
        await new Promise(r => setTimeout(r));
        const newState = baseReducer(state, setNameAction);
        expect(newState.lastModified > state.lastModified).toBe(true);
    });

    it('should update operations list', async () => {
        const setNameAction = setName('Document');
        const state = initDocument();
        const newState = baseReducer(state, setNameAction);
        expect(newState.operations).toStrictEqual([
            { ...setNameAction, index: 0 },
        ]);
    });
});
