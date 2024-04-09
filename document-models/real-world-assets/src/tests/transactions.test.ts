/**
 * This is a scaffold file meant for customization:
 * - change it by adding new tests or modifying the existing ones
 */

import { generateMock } from '@powerhousedao/codegen';
import { addDays } from 'date-fns';
import { reducer } from '../../gen/reducer';
import { z } from '../../gen/schema';
import * as creators from '../../gen/transactions/creators';
import utils from '../../gen/utils';
const principalLenderAccount = generateMock(z.AccountSchema());
const mockAccount = generateMock(z.AccountSchema());
const mockCounterParty = generateMock(z.AccountSchema());
const mockCashAsset = generateMock(z.CashSchema());
const mockFixedIncomeAsset = generateMock(z.FixedIncomeSchema());
mockFixedIncomeAsset.maturity = addDays(new Date(), 30).toDateString();
const mockServiceProvider = generateMock(z.ServiceProviderFeeTypeSchema());
mockServiceProvider.accountId = mockCounterParty.id;
const mockCashTransaction = generateMock(z.BaseTransactionSchema());
mockCashTransaction.accountId = mockAccount.id;
mockCashTransaction.counterPartyAccountId = principalLenderAccount.id;
mockCashTransaction.assetId = mockCashAsset.id;
const mockFixedIncomeTransaction = generateMock(z.BaseTransactionSchema());
mockFixedIncomeTransaction.assetId = mockFixedIncomeAsset.id;
mockFixedIncomeTransaction.accountId = mockAccount.id;
mockFixedIncomeTransaction.counterPartyAccountId = mockAccount.id;

describe('Transactions Operations', () => {
    const document = utils.createDocument({
        state: {
            global: {
                accounts: [
                    principalLenderAccount,
                    mockCounterParty,
                    mockAccount,
                ],
                principalLenderAccountId: principalLenderAccount.id,
                spvs: [],
                serviceProviderFeeTypes: [mockServiceProvider],
                fixedIncomeTypes: [],
                portfolio: [mockCashAsset, mockFixedIncomeAsset],
                transactions: [],
            },
            local: {},
        },
    });
    test('createGroupTransactionOperation', () => {
        const input = generateMock(z.GroupTransactionSchema());
        input.cashTransaction = mockCashTransaction;
        input.fixedIncomeTransaction = mockFixedIncomeTransaction;
        input.fees = [];
        const updatedDocument = reducer(
            document,
            creators.createGroupTransaction(input),
        );
        expect(updatedDocument.operations.global).toHaveLength(1);
        expect(updatedDocument.operations.global[0].type).toBe(
            'CREATE_GROUP_TRANSACTION',
        );
        expect(updatedDocument.operations.global[0].input).toStrictEqual(input);
        expect(updatedDocument.operations.global[0].index).toEqual(0);
    });
    it('should handle deleteGroupTransaction operation', () => {
        const existingGroupTransaction = generateMock(
            z.GroupTransactionSchema(),
        );
        existingGroupTransaction.cashTransaction = mockCashTransaction;
        existingGroupTransaction.fixedIncomeTransaction =
            mockFixedIncomeTransaction;
        const input = generateMock(z.DeleteGroupTransactionInputSchema());
        input.id = existingGroupTransaction.id;
        const initialDocument = utils.createDocument({
            ...document,
            state: {
                ...document.state,
                global: {
                    ...document.state.global,
                    transactions: [existingGroupTransaction],
                    portfolio: [mockCashAsset, mockFixedIncomeAsset],
                },
            },
        });

        const updatedDocument = reducer(
            initialDocument,
            creators.deleteGroupTransaction(input),
        );

        expect(updatedDocument.operations.global).toHaveLength(1);
        expect(updatedDocument.operations.global[0].type).toBe(
            'DELETE_GROUP_TRANSACTION',
        );
        expect(updatedDocument.operations.global[0].input).toStrictEqual(input);
        expect(updatedDocument.operations.global[0].index).toEqual(0);
    });
});
