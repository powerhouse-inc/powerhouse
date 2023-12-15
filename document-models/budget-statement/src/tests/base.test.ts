/**
* This is a scaffold file meant for customization: 
* - change it by adding new tests or modifying the existing ones
*/

import { generateMock } from '@acaldas/powerhouse';

import utils from '../../gen/utils';
import { z } from '../../gen/schema'; 
import { reducer } from '../../gen/reducer';
import * as creators from '../../gen/base/creators';
import { BudgetStatementDocument } from '../../gen/types';


describe('Base Operations', () => {
    let document: BudgetStatementDocument;

    beforeEach(() => {
        document = utils.createDocument();
    });

    it('should handle setOwner operation', () => {
        const input = generateMock(z.SetOwnerInputSchema());
        const updatedDocument = reducer(document, creators.setOwner(input));

        expect(updatedDocument.operations.global).toHaveLength(1);
        expect(updatedDocument.operations.global[0].type).toBe('SET_OWNER');
        expect(updatedDocument.operations.global[0].input).toStrictEqual(input);
        expect(updatedDocument.operations.global[0].index).toEqual(0);
    });

    it('should handle setMonth operation', () => {
        const input = generateMock(z.SetMonthInputSchema());
        const updatedDocument = reducer(document, creators.setMonth(input));

        expect(updatedDocument.operations.global).toHaveLength(1);
        expect(updatedDocument.operations.global[0].type).toBe('SET_MONTH');
        expect(updatedDocument.operations.global[0].input).toStrictEqual(input);
        expect(updatedDocument.operations.global[0].index).toEqual(0);
    });

    it('should handle setFtes operation', () => {
        const input = generateMock(z.SetFtesInputSchema());
        const updatedDocument = reducer(document, creators.setFtes(input));

        expect(updatedDocument.operations.global).toHaveLength(1);
        expect(updatedDocument.operations.global[0].type).toBe('SET_FTES');
        expect(updatedDocument.operations.global[0].input).toStrictEqual(input);
        expect(updatedDocument.operations.global[0].index).toEqual(0);
    });

    it('should handle setQuoteCurrency operation', () => {
        const input = generateMock(z.SetQuoteCurrencyInputSchema());
        const updatedDocument = reducer(document, creators.setQuoteCurrency(input));

        expect(updatedDocument.operations.global).toHaveLength(1);
        expect(updatedDocument.operations.global[0].type).toBe('SET_QUOTE_CURRENCY');
        expect(updatedDocument.operations.global[0].input).toStrictEqual(input);
        expect(updatedDocument.operations.global[0].index).toEqual(0);
    });

});