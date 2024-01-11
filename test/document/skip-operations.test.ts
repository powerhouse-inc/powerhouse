import { setName } from '../../src/document/actions';
import { createDocument } from '../../src/document/utils';
import {
    emptyReducer,
    mapOperations,
} from '../helpers';

describe('skip operations', () => {
    it('should include skip param in base operations with default value to 0 if not provided', () => {
        let document = createDocument();
        document = emptyReducer(document, setName('TEST_1'));
        document = emptyReducer(document, setName('TEST_2'));
        document = emptyReducer(document, setName('TEST_3'));
 

        expect(document.revision.global).toBe(3);

        const ops = mapOperations(document.operations.global);

        expect(ops.length).toBe(3);

        ops.forEach(op => {
            expect(op).toHaveProperty('skip', 0);
        });
    });

    it('should include skip param in base operations with provided value', () => {
        let document = createDocument();
        document = emptyReducer(document, setName('TEST_1', 1));
        document = emptyReducer(document, setName('TEST_2', 2));
        document = emptyReducer(document, setName('TEST_3', 3));
 

        expect(document.revision.global).toBe(3);

        const ops = mapOperations(document.operations.global);

        expect(ops.length).toBe(3);

        ops.forEach((op, index) => {
            expect(op).toHaveProperty('skip', index + 1);
        });
    });
});
