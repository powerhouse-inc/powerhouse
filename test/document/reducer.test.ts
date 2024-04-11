import { Action, CreateChildDocumentInput, utils } from '../../src/document';
import { setName } from '../../src/document/actions/creators';
import { SET_NAME } from '../../src/document/actions/types';
import {
    createAction,
    createDocument,
    createReducer,
} from '../../src/document/utils';
import { emptyReducer, wrappedEmptyReducer } from '../helpers';

describe('Base reducer', () => {
    beforeAll(() => {
        vi.useFakeTimers().setSystemTime(new Date('2020-01-01'));
    });

    it('should update revision', async () => {
        const document = createDocument();
        const newDocument = emptyReducer(document, {
            type: 'TEST',
            input: {},
            scope: 'global',
        });
        expect(newDocument.revision.global).toBe(1);
    });

    it('should update lastModified', async () => {
        vi.useFakeTimers();
        const document = createDocument();
        await new Promise(r => {
            setTimeout(r, 100);
            vi.runOnlyPendingTimers();
        });
        const newDocument = emptyReducer(document, {
            type: 'TEST',
            input: {},
            scope: 'global',
        });
        expect(newDocument.lastModified > document.lastModified).toBe(true);
        vi.useRealTimers();
    });

    it('should update global operations list', async () => {
        vi.useFakeTimers({ now: new Date('2023-01-01') });
        const document = createDocument();
        const newDocument = emptyReducer(document, {
            type: 'TEST',
            input: {},
            scope: 'global',
        });

        expect(newDocument.operations.global).toStrictEqual([
            {
                type: 'TEST',
                timestamp: new Date().toISOString(),
                index: 0,
                skip: 0,
                input: {},
                hash: 'vyGp6PvFo4RvsFtPoIWeCReyIC8=',
                scope: 'global',
            },
        ]);
        expect(newDocument.operations.local).toStrictEqual([]);
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
            scope: 'global',
        });
    });

    it('should throw error creating invalid SET_NAME action', () => {
        expect(() => setName(1 as unknown as string)).toThrow();
    });

    it('should set document name', async () => {
        const document = createDocument();
        const newDocument = emptyReducer(document, setName('Document'));
        expect(newDocument.name).toBe('Document');
    });

    it('should throw error on invalid base action', async () => {
        const document = createDocument();
        expect(() =>
            emptyReducer(document, {
                type: 'SET_NAME',
                input: 0 as unknown as string,
                scope: 'global',
            }),
        ).toThrow();
    });

    it('should dispatch trigger action', async () => {
        expect.assertions(4);
        const document = createDocument();

        const id = utils.hashKey();
        const reducer = createReducer((_state, action, dispatch) => {
            if (action.type === 'CREATE_DOCUMENT') {
                // @ts-expect-error TODO add synchronization units to fix type error
                dispatch?.({
                    type: 'CREATE_CHILD_DOCUMENT',
                    input: {
                        id,
                        documentType: 'test',
                        document: createDocument({
                            state: { global: { value: 'test' }, local: {} },
                        }),
                    },
                });
            }

            return _state;
        });

        const triggerAction: Action = {
            type: 'CREATE_DOCUMENT',
            input: '',
            scope: 'global',
        };

        reducer(document, triggerAction, action => {
            expect(action.type).toBe('CREATE_CHILD_DOCUMENT');
            const input = action.input as CreateChildDocumentInput;
            expect(input.id).toBe(id);
            expect(input.documentType).toBe('test');
            expect(input.document?.initialState.state.global).toStrictEqual({
                value: 'test',
            });
        });
    });

    it('should throw an error when there is a missing index operation', () => {
        let document = createDocument();
        document = emptyReducer(document, {
            type: 'TEST_0',
            input: {},
            scope: 'global',
        });

        document = emptyReducer(document, {
            type: 'TEST_1',
            input: {},
            scope: 'global',
        });

        expect(() => {
            wrappedEmptyReducer(document, {
                type: 'TEST_2',
                input: {},
                scope: 'global',
                index: 3,
            });
        }).toThrow(
            'Missing operations: expected 2 with skip 0 or equivalent, got index 3 with skip 0',
        );
    });

    it('should throw an error when there is a missing index operation + skip', () => {
        let document = createDocument();
        document = emptyReducer(document, {
            type: 'TEST_0',
            input: {},
            scope: 'global',
        });

        document = emptyReducer(document, {
            type: 'TEST_1',
            input: {},
            scope: 'global',
        });

        expect(() => {
            wrappedEmptyReducer(
                document,
                {
                    type: 'TEST_2',
                    input: {},
                    scope: 'global',
                    index: 4,
                },
                undefined,
                { skip: 1 },
            );
        }).toThrow(
            'Missing operations: expected 2 with skip 0 or equivalent, got index 4 with skip 1',
        );
    });

    it('should not throw an error when there is a valid index operation + skip', () => {
        let document = createDocument();
        document = emptyReducer(document, {
            type: 'TEST_0',
            input: {},
            scope: 'global',
        });

        document = emptyReducer(document, {
            type: 'TEST_1',
            input: {},
            scope: 'global',
        });

        document = wrappedEmptyReducer(
            document,
            {
                type: 'TEST_2',
                input: {},
                scope: 'global',
                index: 3,
            },
            undefined,
            { skip: 1 },
        );

        expect(document.operations.global).toMatchObject([
            {
                type: 'TEST_0',
                index: 0,
            },
            {
                type: 'TEST_1',
                index: 1,
            },
            {
                type: 'TEST_2',
                index: 3,
                skip: 1,
            },
        ]);
    });
});
