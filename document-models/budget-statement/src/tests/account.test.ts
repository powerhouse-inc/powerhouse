/**
* This is a scaffold file meant for customization: 
* - change it by adding new tests or modifying the existing ones
*/

import { generateMock } from '@acaldas/powerhouse';

import utils from '../../gen/utils';
import { z } from '../../gen/schema'; 
import { reducer } from '../../gen/reducer';
import * as creators from '../../gen/account/creators';
import { BudgetStatementDocument } from '../../gen/types';


describe('Account Operations', () => {
    let document: BudgetStatementDocument;

    beforeEach(() => {
        document = utils.createDocument();
    });

    it('should handle addAccount operation', () => {
        const input = generateMock(z.AddAccountInputSchema());
        const updatedDocument = reducer(document, creators.addAccount(input));

        expect(updatedDocument.operations.global).toHaveLength(1);
        expect(updatedDocument.operations.global[0].type).toBe('ADD_ACCOUNT');
        expect(updatedDocument.operations.global[0].input).toStrictEqual(input);
        expect(updatedDocument.operations.global[0].index).toEqual(0);
    });

    it('should handle updateAccount operation', () => {
        const input = generateMock(z.UpdateAccountInputSchema());
        const updatedDocument = reducer(document, creators.updateAccount(input));

        expect(updatedDocument.operations.global).toHaveLength(1);
        expect(updatedDocument.operations.global[0].type).toBe('UPDATE_ACCOUNT');
        expect(updatedDocument.operations.global[0].input).toStrictEqual(input);
        expect(updatedDocument.operations.global[0].index).toEqual(0);
    });

    it('should handle deleteAccount operation', () => {
        const input = generateMock(z.DeleteAccountInputSchema());
        const updatedDocument = reducer(document, creators.deleteAccount(input));

        expect(updatedDocument.operations.global).toHaveLength(1);
        expect(updatedDocument.operations.global[0].type).toBe('DELETE_ACCOUNT');
        expect(updatedDocument.operations.global[0].input).toStrictEqual(input);
        expect(updatedDocument.operations.global[0].index).toEqual(0);
    });

    it('should handle sortAccounts operation', () => {
        const input = generateMock(z.SortAccountsInputSchema());
        const updatedDocument = reducer(document, creators.sortAccounts(input));

        expect(updatedDocument.operations.global).toHaveLength(1);
        expect(updatedDocument.operations.global[0].type).toBe('SORT_ACCOUNTS');
        expect(updatedDocument.operations.global[0].input).toStrictEqual(input);
        expect(updatedDocument.operations.global[0].index).toEqual(0);
    });

});