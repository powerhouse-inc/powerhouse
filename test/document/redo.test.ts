import { redo, setName, undo } from '../../src/document/actions';
import { createDocument } from '../../src/document/utils';
import { emptyReducer, mapOperations } from '../helpers';

describe('REDO operation', () => {
    it('should redo previous UNDO operation', () => {
        let document = createDocument();
        document = emptyReducer(document, setName('TEST_1'));
        document = emptyReducer(document, undo(1));
        document = emptyReducer(document, redo(1));

        expect(document.name).toBe('TEST_1');
        expect(mapOperations(document.operations)).toStrictEqual([
            { ...setName('TEST_1'), index: 0 },
        ]);
        expect(document.revision).toBe(1);
    });

    it('should remove multiple UNDO operations', () => {
        let document = createDocument();
        document = emptyReducer(document, setName('TEST_1'));
        document = emptyReducer(document, setName('TEST_2'));
        document = emptyReducer(document, undo(1));
        document = emptyReducer(document, undo(1));
        document = emptyReducer(document, redo(2));

        expect(document.name).toBe('TEST_2');
        expect(mapOperations(document.operations)).toStrictEqual([
            { ...setName('TEST_1'), index: 0 },
            { ...setName('TEST_2'), index: 1 },
        ]);
        expect(document.revision).toBe(2);
    });

    it('should remove UNDO operations up to count', () => {
        let document = createDocument();
        document = emptyReducer(document, setName('TEST_1'));
        document = emptyReducer(document, setName('TEST_2'));
        document = emptyReducer(document, undo(2));
        document = emptyReducer(document, redo(1));

        expect(document.name).toBe('TEST_1');
        expect(mapOperations(document.operations)).toStrictEqual([
            { ...setName('TEST_1'), index: 0 },
            { ...setName('TEST_2'), index: 1 },
        ]);
        expect(document.revision).toBe(1);
    });

    it('should support multiple redo operations', () => {
        let document = createDocument();
        document = emptyReducer(document, setName('TEST_1'));
        document = emptyReducer(document, setName('TEST_2'));
        document = emptyReducer(document, undo(2));
        document = emptyReducer(document, redo(1));
        document = emptyReducer(document, redo(1));

        expect(document.name).toBe('TEST_2');
        expect(mapOperations(document.operations)).toStrictEqual([
            { ...setName('TEST_1'), index: 0 },
            { ...setName('TEST_2'), index: 1 },
        ]);
        expect(document.revision).toBe(2);
    });

    it('should redo all UNDO operations up to count', () => {
        let document = createDocument();
        document = emptyReducer(document, setName('TEST_1'));
        document = emptyReducer(document, setName('TEST_2'));
        document = emptyReducer(document, undo(2));
        document = emptyReducer(document, redo(5));

        expect(document.name).toBe('TEST_2');
        expect(mapOperations(document.operations)).toStrictEqual([
            { ...setName('TEST_1'), index: 0 },
            { ...setName('TEST_2'), index: 1 },
        ]);
        expect(document.revision).toBe(2);
    });

    it('should redo the latest UNDO operation', () => {
        let document = createDocument();
        document = emptyReducer(document, setName('TEST_1'));
        document = emptyReducer(document, undo(1));
        document = emptyReducer(document, setName('TEST_2'));
        document = emptyReducer(document, undo(1));
        document = emptyReducer(document, redo(1));
        expect(mapOperations(document.operations)).toStrictEqual([
            { ...setName('TEST_2'), index: 0 },
        ]);
        expect(document.name).toBe('TEST_2');
        expect(document.revision).toBe(1);
    });

    it("should throw error when last operation isn't UNDO", () => {
        let document = createDocument();
        document = emptyReducer(document, setName('TEST_1'));
        expect(() => emptyReducer(document, redo(1))).toThrow();
    });

    it('should throw error when there are no operations', () => {
        const document = createDocument();
        expect(() => emptyReducer(document, redo(1))).toThrow();
    });
});
