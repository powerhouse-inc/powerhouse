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
        const document = createDocument<CountState, CountAction>({
            documentType: 'powerhouse/counter',
            state: { count: 0 },
        });
        let newDocument = countReducer(document, increment());
        newDocument = countReducer(newDocument, setName('Document'));
        newDocument = countReducer(newDocument, increment());
        newDocument = countReducer(newDocument, increment());
        newDocument = countReducer(newDocument, increment());
        newDocument = countReducer(newDocument, prune(0, 4));

        expect(newDocument.extendedState.name).toBe('Document');
        expect(newDocument.extendedState.state.count).toBe(4);
        expect(newDocument.extendedState.revision).toBe(2);
        expect(mapOperations(newDocument.operations)).toStrictEqual([
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
        expect(newDocument.extendedState.documentType).toBe(
            'powerhouse/counter'
        );
        expect(newDocument.initialState.state).toStrictEqual({ count: 0 });
        expect(newDocument.initialState.state).toStrictEqual(
            document.extendedState.state
        );
    });

    it('should prune last 3 operations', async () => {
        const document = createDocument<CountState, CountAction>({
            documentType: 'powerhouse/counter',
            state: { count: 0 },
        });
        let newDocument = countReducer(document, increment());
        newDocument = countReducer(newDocument, setName('Document'));
        newDocument = countReducer(newDocument, increment());
        newDocument = countReducer(newDocument, increment());
        newDocument = countReducer(newDocument, increment());
        newDocument = countReducer(newDocument, prune(2));

        expect(newDocument.extendedState.name).toBe('Document');
        expect(newDocument.extendedState.state.count).toBe(4);
        expect(newDocument.extendedState.revision).toBe(3);
        expect(mapOperations(newDocument.operations)).toStrictEqual([
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
        expect(newDocument.extendedState.documentType).toBe(
            'powerhouse/counter'
        );
        expect(newDocument.initialState.state).toStrictEqual({ count: 0 });
        expect(newDocument.initialState.state).toStrictEqual(
            document.extendedState.state
        );
    });

    it('should prune 2 operations', async () => {
        const document = createDocument<CountState, CountAction>({
            documentType: 'powerhouse/counter',
            state: { count: 0 },
        });
        let newDocument = countReducer(document, increment());
        newDocument = countReducer(newDocument, setName('Document'));
        newDocument = countReducer(newDocument, increment());
        newDocument = countReducer(newDocument, increment());
        newDocument = countReducer(newDocument, increment());
        newDocument = countReducer(newDocument, prune(2, 4));

        expect(newDocument.extendedState.name).toBe('Document');
        expect(newDocument.extendedState.state.count).toBe(4);
        expect(newDocument.extendedState.revision).toBe(4);
        expect(mapOperations(newDocument.operations)).toStrictEqual([
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
        expect(newDocument.extendedState.documentType).toBe(
            'powerhouse/counter'
        );
        expect(newDocument.initialState.state).toStrictEqual({ count: 0 });
        expect(newDocument.initialState.state).toStrictEqual(
            document.extendedState.state
        );
    });

    it('should undo pruned state', async () => {
        const document = createDocument<CountState, CountAction>({
            documentType: 'powerhouse/counter',
            state: { count: 0 },
        });
        let newDocument = countReducer(document, increment());
        newDocument = countReducer(newDocument, setName('Document'));
        newDocument = countReducer(newDocument, increment());
        newDocument = countReducer(newDocument, increment());
        newDocument = countReducer(newDocument, increment());
        newDocument = countReducer(newDocument, prune(1, 5));
        newDocument = countReducer(newDocument, undo(1));

        expect(newDocument.extendedState.name).toBe('');
        expect(newDocument.extendedState.state.count).toBe(1);
        expect(newDocument.extendedState.revision).toBe(1);
        expect(mapOperations(newDocument.operations)).toStrictEqual([
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
        expect(newDocument.extendedState.documentType).toBe(
            'powerhouse/counter'
        );
        expect(newDocument.initialState.state).toStrictEqual({ count: 0 });
        expect(newDocument.initialState.state).toStrictEqual(
            document.extendedState.state
        );
    });

    it('should redo pruned state', async () => {
        const document = createDocument<CountState, CountAction>({
            documentType: 'powerhouse/counter',
            state: { count: 0 },
        });
        let newDocument = countReducer(document, increment());
        newDocument = countReducer(newDocument, setName('Document'));
        newDocument = countReducer(newDocument, increment());
        newDocument = countReducer(newDocument, increment());
        newDocument = countReducer(newDocument, increment());
        newDocument = countReducer(newDocument, prune(1, 5));
        newDocument = countReducer(newDocument, undo(1));
        newDocument = countReducer(newDocument, redo(1));

        expect(newDocument.extendedState.name).toBe('Document');
        expect(newDocument.extendedState.state.count).toBe(4);
        expect(newDocument.extendedState.revision).toBe(2);
        expect(mapOperations(newDocument.operations)).toStrictEqual([
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
        expect(newDocument.extendedState.documentType).toBe(
            'powerhouse/counter'
        );
        expect(newDocument.initialState.state).toStrictEqual({ count: 0 });
        expect(newDocument.initialState.state).toStrictEqual(
            document.extendedState.state
        );
    });
});
