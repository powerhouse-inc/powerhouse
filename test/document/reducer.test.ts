import { setName } from '../../src/document/actions';
import { SET_NAME } from '../../src/document/actions/types';
import { createAction, createDocument } from '../../src/document/utils';
import { emptyReducer } from '../helpers';

describe('Base reducer', () => {
    beforeAll(() => {
        jest.useFakeTimers().setSystemTime(new Date('2020-01-01'));
    });

    it('should update revision', async () => {
        const document = createDocument();
        const newDocument = emptyReducer(document, { type: 'TEST', input: {} });
        expect(newDocument.extendedState.revision).toBe(1);
    });

    it('should update lastModified', async () => {
        jest.useFakeTimers();
        const document = createDocument();
        await new Promise(r => {
            setTimeout(r, 100);
            jest.runOnlyPendingTimers();
        });
        const newDocument = emptyReducer(document, { type: 'TEST', input: {} });
        expect(
            newDocument.extendedState.lastModified >
                document.extendedState.lastModified
        ).toBe(true);
        jest.useRealTimers();
    });

    it('should update operations list', async () => {
        jest.useFakeTimers({ now: new Date('2023-01-01') });
        const document = createDocument();
        const newDocument = emptyReducer(document, { type: 'TEST', input: {} });

        expect(newDocument.operations).toStrictEqual([
            {
                type: 'TEST',
                timestamp: new Date().toISOString(),
                index: 0,
                input: {},
                hash: 'vyGp6PvFo4RvsFtPoIWeCReyIC8=',
            },
        ]);
    });

    it('should throw error when creating action with non-string type', () => {
        expect(() => createAction(1 as never)).toThrow();
    });

    it('should throw error when creating action with empty type', () => {
        expect(() => createAction('')).toThrow();
    });

    it('should create SET_NAME action', () => {
        const setNameAction = setName('Document');
        expect(setNameAction).toStrictEqual({
            type: SET_NAME,
            input: 'Document',
        });
    });

    it('should throw error creating invalid SET_NAME action', () => {
        expect(() => setName(1 as unknown as string)).toThrow();
    });

    it('should set document name', async () => {
        const document = createDocument();
        const newDocument = emptyReducer(document, setName('Document'));
        expect(newDocument.extendedState.name).toBe('Document');
    });

    it('should throw error on invalid base action', async () => {
        const document = createDocument();
        expect(() =>
            emptyReducer(document, {
                type: 'SET_NAME',
                input: 0 as unknown as string,
            })
        ).toThrow();
    });
});
