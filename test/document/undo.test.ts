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
        let document = createDocument();
        document = emptyReducer(document, setName('TEST_1'));
        expect(document.revision).toBe(1);

        document = emptyReducer(document, undo(1));

        expect(mapOperations(document.operations)).toStrictEqual([
            { ...setName('TEST_1'), index: 0 },
        ]);
        expect(document.name).toBe('');
        expect(document.revision).toBe(0);
    });

    it('should undo multiple operations', () => {
        let document = createDocument();
        document = emptyReducer(document, setName('TEST_1'));
        document = emptyReducer(document, setName('TEST_2'));
        expect(document.revision).toBe(2);

        document = emptyReducer(document, undo(2));
        expect(mapOperations(document.operations)).toStrictEqual([
            { ...setName('TEST_1'), index: 0 },
            { ...setName('TEST_2'), index: 1 },
        ]);
        expect(document.revision).toBe(0);
    });

    it('should undo only existing operations', () => {
        let document = createDocument();
        document = emptyReducer(document, setName('TEST_1'));
        document = emptyReducer(document, setName('TEST_2'));
        document = emptyReducer(document, undo(5));
        expect(mapOperations(document.operations)).toStrictEqual([
            { ...setName('TEST_1'), index: 0 },
            { ...setName('TEST_2'), index: 1 },
        ]);
        expect(document.name).toBe('');
        expect(document.revision).toBe(0);
    });

    it('should clear undone operations when there is a new operation', () => {
        let document = createDocument();
        document = emptyReducer(document, setName('TEST_1'));
        document = emptyReducer(document, undo(1));
        document = emptyReducer(document, setName('TEST_2'));
        expect(mapOperations(document.operations)).toStrictEqual([
            { ...setName('TEST_2'), index: 0 },
        ]);
        expect(document.name).toBe('TEST_2');
        expect(document.revision).toBe(1);
    });

    it('should undo the last UNDO operation', () => {
        let document = createDocument();
        document = emptyReducer(document, setName('TEST_1'));
        document = emptyReducer(document, undo(1));
        document = emptyReducer(document, setName('TEST_2'));
        document = emptyReducer(document, undo(1));
        expect(mapOperations(document.operations)).toStrictEqual([
            { ...setName('TEST_2'), index: 0 },
        ]);
        expect(document.name).toBe('');
        expect(document.revision).toBe(0);
    });

    it('should keep document attributes', () => {
        let document = createDocument<CountState, CountAction>({
            documentType: 'powerhouse/counter',
            state: { count: 0 },
        });
        document = countReducer(document, increment());
        document = countReducer(document, undo(1));
        expect(document.state.count).toBe(0);
        expect(document.documentType).toBe('powerhouse/counter');
    });
});
