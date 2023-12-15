/**
* This is a scaffold file meant for customization: 
* - change it by adding new tests or modifying the existing ones
*/

import { generateMock } from '@acaldas/powerhouse';

import utils from '../../gen/utils';
import { z } from '../../gen/schema'; 
import { reducer } from '../../gen/reducer';
import * as creators from '../../gen/line-item/creators';
import { BudgetStatementDocument } from '../../gen/types';


describe('LineItem Operations', () => {
    let document: BudgetStatementDocument;

    beforeEach(() => {
        document = utils.createDocument();
    });

    it('should handle addLineItem operation', () => {
        const input = generateMock(z.AddLineItemInputSchema());
        const updatedDocument = reducer(document, creators.addLineItem(input));

        expect(updatedDocument.operations.global).toHaveLength(1);
        expect(updatedDocument.operations.global[0].type).toBe('ADD_LINE_ITEM');
        expect(updatedDocument.operations.global[0].input).toStrictEqual(input);
        expect(updatedDocument.operations.global[0].index).toEqual(0);
    });

    it('should handle updateLineItem operation', () => {
        const input = generateMock(z.UpdateLineItemInputSchema());
        const updatedDocument = reducer(document, creators.updateLineItem(input));

        expect(updatedDocument.operations.global).toHaveLength(1);
        expect(updatedDocument.operations.global[0].type).toBe('UPDATE_LINE_ITEM');
        expect(updatedDocument.operations.global[0].input).toStrictEqual(input);
        expect(updatedDocument.operations.global[0].index).toEqual(0);
    });

    it('should handle deleteLineItem operation', () => {
        const input = generateMock(z.DeleteLineItemInputSchema());
        const updatedDocument = reducer(document, creators.deleteLineItem(input));

        expect(updatedDocument.operations.global).toHaveLength(1);
        expect(updatedDocument.operations.global[0].type).toBe('DELETE_LINE_ITEM');
        expect(updatedDocument.operations.global[0].input).toStrictEqual(input);
        expect(updatedDocument.operations.global[0].index).toEqual(0);
    });

    it('should handle sortLineItems operation', () => {
        const input = generateMock(z.SortLineItemsInputSchema());
        const updatedDocument = reducer(document, creators.sortLineItems(input));

        expect(updatedDocument.operations.global).toHaveLength(1);
        expect(updatedDocument.operations.global[0].type).toBe('SORT_LINE_ITEMS');
        expect(updatedDocument.operations.global[0].input).toStrictEqual(input);
        expect(updatedDocument.operations.global[0].index).toEqual(0);
    });

});