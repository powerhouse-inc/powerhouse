/**
 * This is a scaffold file meant for customization:
 * - change it by adding new tests or modifying the existing ones
 */

import { generateMock } from '@powerhousedao/codegen';
import { copy } from 'copy-anything';
import { addDays } from 'date-fns';
import { RealWorldAssetsDocument } from '../../gen';
import { reducer } from '../../gen/reducer';
import { Cash, FixedIncome, z } from '../../gen/schema';
import * as creators from '../../gen/transactions/creators';
import utils from '../../gen/utils';
import {
    ASSET_PURCHASE,
    ASSET_SALE,
    FEES_INCOME,
    FEES_PAYMENT,
    INTEREST_INCOME,
    INTEREST_PAYMENT,
    PRINCIPAL_DRAW,
    PRINCIPAL_RETURN,
} from '../constants';

function generateMocks() {
    const principalLenderAccount = generateMock(z.AccountSchema());
    const mockAccount = generateMock(z.AccountSchema());
    const mockCounterParty = generateMock(z.AccountSchema());
    const mockCashAsset = generateMock(z.CashSchema());
    mockCashAsset.type = 'Cash';
    mockCashAsset.balance = 0;
    const mockFixedIncomeAsset = generateMock(z.FixedIncomeSchema());
    mockFixedIncomeAsset.type = 'FixedIncome';
    mockFixedIncomeAsset.assetProceeds = 0;
    mockFixedIncomeAsset.notional = 0;
    mockFixedIncomeAsset.purchasePrice = 0;
    mockFixedIncomeAsset.purchaseProceeds = 0;
    mockFixedIncomeAsset.realizedSurplus = 0;
    mockFixedIncomeAsset.purchaseDate = new Date().toISOString();
    mockFixedIncomeAsset.salesProceeds = 0;
    mockFixedIncomeAsset.totalDiscount = 0;
    mockFixedIncomeAsset.maturity = addDays(new Date(), 30).toDateString();
    const mockServiceProvider = generateMock(z.ServiceProviderFeeTypeSchema());
    mockServiceProvider.accountId = mockCounterParty.id;
    const mockCashTransaction = generateMock(z.BaseTransactionSchema());
    mockCashTransaction.accountId = mockAccount.id;
    mockCashTransaction.counterPartyAccountId = principalLenderAccount.id;
    mockCashTransaction.assetType = 'Cash';
    mockCashTransaction.assetId = mockCashAsset.id;
    mockCashTransaction.amount = 1;
    const mockFixedIncomeTransaction = generateMock(z.BaseTransactionSchema());
    mockFixedIncomeTransaction.assetType = 'FixedIncome';
    mockFixedIncomeTransaction.assetId = mockFixedIncomeAsset.id;
    mockFixedIncomeTransaction.accountId = mockAccount.id;
    mockFixedIncomeTransaction.counterPartyAccountId = mockAccount.id;
    mockFixedIncomeTransaction.amount = 1;
    const mockTransactionFee = generateMock(z.TransactionFeeSchema());
    mockTransactionFee.serviceProviderFeeTypeId = mockServiceProvider.id;
    mockTransactionFee.amount = 1;
    const mockGroupTransaction = generateMock(z.GroupTransactionSchema());
    mockGroupTransaction.serviceProviderFeeTypeId = null;
    mockGroupTransaction.cashTransaction = mockCashTransaction;
    mockGroupTransaction.fixedIncomeTransaction = mockFixedIncomeTransaction;
    mockGroupTransaction.fees = [mockTransactionFee];

    return {
        principalLenderAccount,
        mockAccount,
        mockCounterParty,
        mockCashAsset,
        mockFixedIncomeAsset,
        mockServiceProvider,
        mockCashTransaction,
        mockFixedIncomeTransaction,
        mockTransactionFee,
        mockGroupTransaction,
    };
}

describe('Transactions Operations', () => {
    let document: RealWorldAssetsDocument;
    let mocks: ReturnType<typeof generateMocks>;

    beforeEach(() => {
        mocks = generateMocks();
        const {
            principalLenderAccount,
            mockAccount,
            mockCounterParty,
            mockCashAsset,
            mockFixedIncomeAsset,
            mockServiceProvider,
            mockGroupTransaction,
        } = mocks;
        document = utils.createDocument({
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
                    transactions: [mockGroupTransaction],
                },
                local: {},
            },
        });
    });
    test('createGroupTransactionOperation', () => {
        const input = generateMock(z.GroupTransactionSchema());
        const {
            mockCashTransaction,
            mockFixedIncomeTransaction,
            mockTransactionFee,
        } = mocks;
        input.cashTransaction = mockCashTransaction;
        input.fixedIncomeTransaction = mockFixedIncomeTransaction;
        input.fees = [mockTransactionFee];

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
    test('editGroupTransactionOperation', () => {
        const input = generateMock(z.GroupTransactionSchema());
        const { mockGroupTransaction } = mocks;
        input.id = mockGroupTransaction.id;

        const updatedDocument = reducer(
            document,
            creators.editGroupTransaction(input),
        );
        expect(updatedDocument.operations.global).toHaveLength(1);
        expect(updatedDocument.operations.global[0].type).toBe(
            'EDIT_GROUP_TRANSACTION',
        );

        expect(updatedDocument.operations.global[0].input).toStrictEqual(input);
        expect(updatedDocument.operations.global[0].index).toEqual(0);
    });
    test('deleteGroupTransaction operation', () => {
        const input = generateMock(z.DeleteGroupTransactionInputSchema());
        const { mockGroupTransaction } = mocks;

        input.id = mockGroupTransaction.id;

        const updatedDocument = reducer(
            document,
            creators.deleteGroupTransaction(input),
        );

        expect(updatedDocument.operations.global).toHaveLength(1);
        expect(updatedDocument.operations.global[0].type).toBe(
            'DELETE_GROUP_TRANSACTION',
        );
        expect(updatedDocument.operations.global[0].input).toStrictEqual(input);
        expect(updatedDocument.operations.global[0].index).toEqual(0);
    });
    test('addFeesToGroupTransactionOperation', () => {
        const input = generateMock(z.TransactionFeeSchema());
        const { mockGroupTransaction, mockServiceProvider } = mocks;
        input.id = mockGroupTransaction.id;
        input.serviceProviderFeeTypeId = mockServiceProvider.id;

        const updatedDocument = reducer(
            document,
            creators.addFeesToGroupTransaction(input),
        );
        expect(updatedDocument.operations.global).toHaveLength(1);
        expect(updatedDocument.operations.global[0].type).toBe(
            'ADD_FEES_TO_GROUP_TRANSACTION',
        );

        expect(updatedDocument.operations.global[0].input).toStrictEqual(input);
        expect(updatedDocument.operations.global[0].index).toEqual(0);
    });
    test('removeFeesFromGroupTransactionOperation', () => {
        const input = generateMock(z.TransactionFeeSchema());
        const { mockGroupTransaction } = mocks;
        input.id = mockGroupTransaction.id;

        const updatedDocument = reducer(
            document,
            creators.removeFeesFromGroupTransaction(input),
        );
        expect(updatedDocument.operations.global).toHaveLength(1);
        expect(updatedDocument.operations.global[0].type).toBe(
            'REMOVE_FEES_FROM_GROUP_TRANSACTION',
        );

        expect(updatedDocument.operations.global[0].input).toStrictEqual(input);
        expect(updatedDocument.operations.global[0].index).toEqual(0);
    });
    test('editGroupTransactionFeesOperation', () => {
        const input = generateMock(z.TransactionFeeSchema());
        const { mockGroupTransaction, mockServiceProvider } = mocks;
        input.id = mockGroupTransaction.id;
        input.serviceProviderFeeTypeId = mockServiceProvider.id;
        input.amount = 100;

        const updatedDocument = reducer(
            document,
            creators.editGroupTransactionFees(input),
        );
        expect(updatedDocument.operations.global).toHaveLength(1);
        expect(updatedDocument.operations.global[0].type).toBe(
            'EDIT_GROUP_TRANSACTION_FEES',
        );

        expect(updatedDocument.operations.global[0].input).toStrictEqual(input);
        expect(updatedDocument.operations.global[0].index).toEqual(0);
    });
});

describe('Transaction interactions with assets', () => {
    let document: RealWorldAssetsDocument;
    let mocks: ReturnType<typeof generateMocks>;

    beforeEach(() => {
        mocks = generateMocks();
        const {
            principalLenderAccount,
            mockAccount,
            mockCounterParty,
            mockCashAsset,
            mockFixedIncomeAsset,
            mockServiceProvider,
        } = mocks;
        document = utils.createDocument({
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
    });

    test('Asset sale transaction', () => {
        const input = generateMock(z.GroupTransactionSchema());
        input.type = ASSET_SALE;
        const {
            mockCashTransaction,
            mockFixedIncomeTransaction,
            mockTransactionFee,
        } = mocks;
        input.fees = null;
        input.cashTransaction = mockCashTransaction;
        input.cashTransaction.amount = 1;
        input.fixedIncomeTransaction = mockFixedIncomeTransaction;

        // without fees
        const updatedDocumentWithoutFees = reducer(
            document,
            creators.createGroupTransaction(input),
        );

        const [cashAsset, fixedIncomeAsset] = updatedDocumentWithoutFees.state
            .global.portfolio as [Cash, FixedIncome];

        expect(cashAsset.balance).toBe(1);
        expect(fixedIncomeAsset.assetProceeds).toBe(1);
        expect(fixedIncomeAsset.salesProceeds).toBe(1);
        expect(fixedIncomeAsset.realizedSurplus).toBe(1);
        expect(fixedIncomeAsset.purchaseProceeds).toBe(0);
        expect(fixedIncomeAsset.notional).toBe(-1);
        expect(fixedIncomeAsset.totalDiscount).toBe(0);

        // with fees
        input.fees = [mockTransactionFee];

        const updatedDocumentWithFees = reducer(
            document,
            creators.createGroupTransaction(input),
        );

        const [cashAssetWithFees, fixedIncomeAssetWithFees] =
            updatedDocumentWithFees.state.global.portfolio as [
                Cash,
                FixedIncome,
            ];

        expect(cashAssetWithFees.balance).toBe(0);
        expect(fixedIncomeAssetWithFees.assetProceeds).toBe(1);
        expect(fixedIncomeAssetWithFees.salesProceeds).toBe(0);
        expect(fixedIncomeAssetWithFees.realizedSurplus).toBe(0);
        expect(fixedIncomeAssetWithFees.purchaseProceeds).toBe(0);
        expect(fixedIncomeAssetWithFees.notional).toBe(-1);
        expect(fixedIncomeAssetWithFees.totalDiscount).toBe(-1);

        const inputToChangeCashAmount = copy(input);
        inputToChangeCashAmount.cashTransaction.amount = 2;

        const updatedDocumentWithFeesAndChangedCashAmount = reducer(
            updatedDocumentWithFees,
            creators.editGroupTransaction(inputToChangeCashAmount),
        );

        const [cashAssetWithFeesAndChangedCashAmount] =
            updatedDocumentWithFeesAndChangedCashAmount.state.global
                .portfolio as [Cash];

        expect(cashAssetWithFeesAndChangedCashAmount.balance).toBe(1);

        const inputToChangeFixedIncomeAmount = copy(input);
        inputToChangeFixedIncomeAmount.fixedIncomeTransaction!.amount = 2;

        const updatedDocumentWithFeesAndChangedFixedIncomeAmount = reducer(
            updatedDocumentWithFees,
            creators.editGroupTransaction(inputToChangeFixedIncomeAmount),
        );

        const [
            cashAssetAndChangedFixedIncomeAmount,
            fixedIncomeAssetAndChangedAmount,
        ] = updatedDocumentWithFeesAndChangedFixedIncomeAmount.state.global
            .portfolio as [Cash, FixedIncome];

        expect(cashAssetAndChangedFixedIncomeAmount.balance).toBe(0);
        expect(fixedIncomeAssetAndChangedAmount.assetProceeds).toBe(1);
        expect(fixedIncomeAssetAndChangedAmount.salesProceeds).toBe(0);
        expect(fixedIncomeAssetAndChangedAmount.realizedSurplus).toBe(0);
        expect(fixedIncomeAssetAndChangedAmount.purchaseProceeds).toBe(0);
        expect(fixedIncomeAssetAndChangedAmount.notional).toBe(-2);
        expect(fixedIncomeAssetAndChangedAmount.totalDiscount).toBe(-2);

        const inputToChangeType = copy(input);
        inputToChangeType.type = ASSET_PURCHASE;

        const updatedDocumentWithFeesAndChangedType = reducer(
            updatedDocumentWithFees,
            creators.editGroupTransaction(inputToChangeType),
        );

        const [cashAssetAndChangedType, fixedIncomeAssetAndChangedType] =
            updatedDocumentWithFeesAndChangedType.state.global.portfolio as [
                Cash,
                FixedIncome,
            ];

        expect(cashAssetAndChangedType.balance).toBe(-2);
        expect(fixedIncomeAssetAndChangedType.assetProceeds).toBe(-1);
        expect(fixedIncomeAssetAndChangedType.salesProceeds).toBe(0);
        expect(fixedIncomeAssetAndChangedType.realizedSurplus).toBe(0);
        expect(fixedIncomeAssetAndChangedType.purchaseProceeds).toBe(2);
        expect(fixedIncomeAssetAndChangedType.notional).toBe(2);
        expect(fixedIncomeAssetAndChangedType.totalDiscount).toBe(0);

        const otherAsset = copy(mocks.mockFixedIncomeAsset);
        otherAsset.id = 'other-asset-id';

        updatedDocumentWithFees.state.global.portfolio.push(otherAsset);
        const inputToChangeAsset = copy(input);
        inputToChangeAsset.fixedIncomeTransaction!.assetId = otherAsset.id;

        const updatedDocumentWithFeesAndChangedAsset = reducer(
            updatedDocumentWithFees,
            creators.editGroupTransaction(inputToChangeAsset),
        );

        const [
            cashAssetAndChangedFixedIncomeAsset,
            initialAsset,
            otherAssetAfterChange,
        ] = updatedDocumentWithFeesAndChangedAsset.state.global.portfolio as [
            Cash,
            FixedIncome,
            FixedIncome,
        ];

        expect(cashAssetAndChangedFixedIncomeAsset.balance).toBe(0);
        expect(initialAsset.assetProceeds).toBe(0);
        expect(initialAsset.salesProceeds).toBe(0);
        expect(initialAsset.realizedSurplus).toBe(0);
        expect(initialAsset.purchaseProceeds).toBe(0);
        expect(initialAsset.notional).toBe(0);
        expect(initialAsset.totalDiscount).toBe(0);

        expect(otherAssetAfterChange.assetProceeds).toBe(1);
        expect(otherAssetAfterChange.salesProceeds).toBe(0);
        expect(otherAssetAfterChange.realizedSurplus).toBe(0);
        expect(otherAssetAfterChange.purchaseProceeds).toBe(0);
        expect(otherAssetAfterChange.notional).toBe(-1);
        expect(otherAssetAfterChange.totalDiscount).toBe(-1);

        const inputToDelete = copy(input);

        const updatedDocumentWithFeesAndDeleted = reducer(
            updatedDocumentWithFees,
            creators.deleteGroupTransaction(inputToDelete),
        );

        const [cashAssetAfterDelete, fixedIncomeAssetAfterDelete] =
            updatedDocumentWithFeesAndDeleted.state.global.portfolio as [
                Cash,
                FixedIncome,
            ];

        expect(cashAssetAfterDelete.balance).toBe(0);
        expect(fixedIncomeAssetAfterDelete.assetProceeds).toBe(0);
        expect(fixedIncomeAssetAfterDelete.salesProceeds).toBe(0);
        expect(fixedIncomeAssetAfterDelete.realizedSurplus).toBe(0);
        expect(fixedIncomeAssetAfterDelete.purchaseProceeds).toBe(0);
        expect(fixedIncomeAssetAfterDelete.notional).toBe(0);
        expect(fixedIncomeAssetAfterDelete.totalDiscount).toBe(0);
    });

    test('Asset purchase transaction', () => {
        const input = generateMock(z.GroupTransactionSchema());
        input.type = ASSET_PURCHASE;
        const {
            mockCashTransaction,
            mockFixedIncomeTransaction,
            mockTransactionFee,
        } = mocks;
        input.fees = null;
        input.cashTransaction = mockCashTransaction;
        input.cashTransaction.amount = 1;
        input.fixedIncomeTransaction = mockFixedIncomeTransaction;

        // without fees
        const updatedDocumentWithoutFees = reducer(
            document,
            creators.createGroupTransaction(input),
        );

        const [cashAsset, fixedIncomeAsset] = updatedDocumentWithoutFees.state
            .global.portfolio as [Cash, FixedIncome];

        expect(cashAsset.balance).toBe(-1);
        expect(fixedIncomeAsset.assetProceeds).toBe(-1);
        expect(fixedIncomeAsset.salesProceeds).toBe(0);
        expect(fixedIncomeAsset.realizedSurplus).toBe(0);
        expect(fixedIncomeAsset.purchaseProceeds).toBe(1);
        expect(fixedIncomeAsset.notional).toBe(2);
        expect(fixedIncomeAsset.totalDiscount).toBe(1);

        // with fees
        input.fees = [mockTransactionFee];

        const updatedDocumentWithFees = reducer(
            document,
            creators.createGroupTransaction(input),
        );

        const [cashAssetWithFees, fixedIncomeAssetWithFees] =
            updatedDocumentWithFees.state.global.portfolio as [
                Cash,
                FixedIncome,
            ];

        expect(cashAssetWithFees.balance).toBe(-2);
        expect(fixedIncomeAssetWithFees.assetProceeds).toBe(-1);
        expect(fixedIncomeAssetWithFees.salesProceeds).toBe(0);
        expect(fixedIncomeAssetWithFees.realizedSurplus).toBe(0);
        expect(fixedIncomeAssetWithFees.purchaseProceeds).toBe(2);
        expect(fixedIncomeAssetWithFees.notional).toBe(2);
        expect(fixedIncomeAssetWithFees.totalDiscount).toBe(0);

        const inputToChangeCashAmount = copy(input);
        inputToChangeCashAmount.cashTransaction.amount = 2;

        const updatedDocumentWithFeesAndChangedCashAmount = reducer(
            updatedDocumentWithFees,
            creators.editGroupTransaction(inputToChangeCashAmount),
        );

        const [cashAssetWithFeesAndChangedCashAmount] =
            updatedDocumentWithFeesAndChangedCashAmount.state.global
                .portfolio as [Cash];

        expect(cashAssetWithFeesAndChangedCashAmount.balance).toBe(-3);

        const inputToChangeFixedIncomeAmount = copy(input);
        inputToChangeFixedIncomeAmount.fixedIncomeTransaction!.amount = 2;

        const updatedDocumentWithFeesAndChangedFixedIncomeAmount = reducer(
            updatedDocumentWithFees,
            creators.editGroupTransaction(inputToChangeFixedIncomeAmount),
        );

        const [
            cashAssetAndChangedFixedIncomeAmount,
            fixedIncomeAssetAndChangedAmount,
        ] = updatedDocumentWithFeesAndChangedFixedIncomeAmount.state.global
            .portfolio as [Cash, FixedIncome];

        expect(cashAssetAndChangedFixedIncomeAmount.balance).toBe(-2);
        expect(fixedIncomeAssetAndChangedAmount.assetProceeds).toBe(-1);
        expect(fixedIncomeAssetAndChangedAmount.salesProceeds).toBe(0);
        expect(fixedIncomeAssetAndChangedAmount.realizedSurplus).toBe(0);
        expect(fixedIncomeAssetAndChangedAmount.purchaseProceeds).toBe(2);
        expect(fixedIncomeAssetAndChangedAmount.notional).toBe(2.5);
        expect(fixedIncomeAssetAndChangedAmount.totalDiscount).toBe(0.5);

        const inputToChangeType = copy(input);
        inputToChangeType.type = ASSET_SALE;

        const updatedDocumentWithFeesAndChangedType = reducer(
            updatedDocumentWithFees,
            creators.editGroupTransaction(inputToChangeType),
        );

        const [cashAssetAndChangedType, fixedIncomeAssetAndChangedType] =
            updatedDocumentWithFeesAndChangedType.state.global.portfolio as [
                Cash,
                FixedIncome,
            ];

        expect(cashAssetAndChangedType.balance).toBe(0);
        expect(fixedIncomeAssetAndChangedType.assetProceeds).toBe(1);
        expect(fixedIncomeAssetAndChangedType.salesProceeds).toBe(0);
        expect(fixedIncomeAssetAndChangedType.realizedSurplus).toBe(0);
        expect(fixedIncomeAssetAndChangedType.purchaseProceeds).toBe(0);
        expect(fixedIncomeAssetAndChangedType.notional).toBe(-1);
        expect(fixedIncomeAssetAndChangedType.totalDiscount).toBe(-1);

        const otherAsset = copy(mocks.mockFixedIncomeAsset);
        otherAsset.id = 'other-asset-id';

        updatedDocumentWithFees.state.global.portfolio.push(otherAsset);
        const inputToChangeAsset = copy(input);
        inputToChangeAsset.fixedIncomeTransaction!.assetId = otherAsset.id;

        const updatedDocumentWithFeesAndChangedAsset = reducer(
            updatedDocumentWithFees,
            creators.editGroupTransaction(inputToChangeAsset),
        );

        const [
            cashAssetAndChangedFixedIncomeAsset,
            initialAsset,
            otherAssetAfterChange,
        ] = updatedDocumentWithFeesAndChangedAsset.state.global.portfolio as [
            Cash,
            FixedIncome,
            FixedIncome,
        ];

        expect(cashAssetAndChangedFixedIncomeAsset.balance).toBe(-2);
        expect(initialAsset.assetProceeds).toBe(0);
        expect(initialAsset.salesProceeds).toBe(0);
        expect(initialAsset.realizedSurplus).toBe(0);
        expect(initialAsset.purchaseProceeds).toBe(0);
        expect(initialAsset.notional).toBe(0);
        expect(initialAsset.totalDiscount).toBe(0);

        expect(otherAssetAfterChange.assetProceeds).toBe(-1);
        expect(otherAssetAfterChange.salesProceeds).toBe(0);
        expect(otherAssetAfterChange.realizedSurplus).toBe(0);
        expect(otherAssetAfterChange.purchaseProceeds).toBe(2);
        expect(otherAssetAfterChange.notional).toBe(2);
        expect(otherAssetAfterChange.totalDiscount).toBe(0);

        const inputToDelete = copy(input);

        const updatedDocumentWithFeesAndDeleted = reducer(
            updatedDocumentWithFees,
            creators.deleteGroupTransaction(inputToDelete),
        );

        const [cashAssetAfterDelete, fixedIncomeAssetAfterDelete] =
            updatedDocumentWithFeesAndDeleted.state.global.portfolio as [
                Cash,
                FixedIncome,
            ];

        expect(cashAssetAfterDelete.balance).toBe(0);
        expect(fixedIncomeAssetAfterDelete.assetProceeds).toBe(0);
        expect(fixedIncomeAssetAfterDelete.salesProceeds).toBe(0);
        expect(fixedIncomeAssetAfterDelete.realizedSurplus).toBe(0);
        expect(fixedIncomeAssetAfterDelete.purchaseProceeds).toBe(0);
        expect(fixedIncomeAssetAfterDelete.notional).toBe(0);
        expect(fixedIncomeAssetAfterDelete.totalDiscount).toBe(0);
    });

    test('Principal draw transaction', () => {
        const input = generateMock(z.GroupTransactionSchema());
        input.type = PRINCIPAL_DRAW;
        const { mockCashTransaction, mockTransactionFee } = mocks;
        input.fees = null;
        input.cashTransaction = mockCashTransaction;
        input.cashTransaction.amount = 1;
        input.fixedIncomeTransaction = null;

        // without fees
        const updatedDocumentWithoutFees = reducer(
            document,
            creators.createGroupTransaction(input),
        );

        const cashAsset = updatedDocumentWithoutFees.state.global
            .portfolio[0] as Cash;

        expect(cashAsset.balance).toBe(1);

        // with fees
        input.fees = [mockTransactionFee];

        const updatedDocumentWithFees = reducer(
            document,
            creators.createGroupTransaction(input),
        );

        const cashAssetWithFees = updatedDocumentWithFees.state.global
            .portfolio[0] as Cash;

        expect(cashAssetWithFees.balance).toBe(0);

        const inputToChangeCashAmount = copy(input);
        inputToChangeCashAmount.cashTransaction.amount = 2;

        const updatedDocumentWithFeesAndChangedCashAmount = reducer(
            updatedDocumentWithFees,
            creators.editGroupTransaction(inputToChangeCashAmount),
        );

        const cashAssetWithFeesAndChangedCashAmount =
            updatedDocumentWithFeesAndChangedCashAmount.state.global
                .portfolio[0] as Cash;

        expect(cashAssetWithFeesAndChangedCashAmount.balance).toBe(1);

        const inputToChangeType = copy(input);
        inputToChangeType.type = PRINCIPAL_RETURN;

        const updatedDocumentWithFeesAndChangedType = reducer(
            updatedDocumentWithFees,
            creators.editGroupTransaction(inputToChangeType),
        );

        const cashAssetWithFeesAndChangedType =
            updatedDocumentWithFeesAndChangedType.state.global
                .portfolio[0] as Cash;

        expect(cashAssetWithFeesAndChangedType.balance).toBe(-2);

        const inputToDelete = copy(input);

        const updatedDocumentWithFeesAndDeleted = reducer(
            updatedDocumentWithFees,
            creators.deleteGroupTransaction(inputToDelete),
        );

        const cashAssetAfterDelete = updatedDocumentWithFeesAndDeleted.state
            .global.portfolio[0] as Cash;

        expect(cashAssetAfterDelete.balance).toBe(0);
    });

    test('Principal return transaction', () => {
        const input = generateMock(z.GroupTransactionSchema());
        input.type = PRINCIPAL_RETURN;
        const { mockCashTransaction, mockTransactionFee } = mocks;
        input.fees = null;
        input.cashTransaction = mockCashTransaction;
        input.cashTransaction.amount = 1;
        input.fixedIncomeTransaction = null;

        // without fees
        const updatedDocumentWithoutFees = reducer(
            document,
            creators.createGroupTransaction(input),
        );

        const cashAsset = updatedDocumentWithoutFees.state.global
            .portfolio[0] as Cash;

        expect(cashAsset.balance).toBe(-1);

        // with fees
        input.fees = [mockTransactionFee];

        const updatedDocumentWithFees = reducer(
            document,
            creators.createGroupTransaction(input),
        );

        const cashAssetWithFees = updatedDocumentWithFees.state.global
            .portfolio[0] as Cash;

        expect(cashAssetWithFees.balance).toBe(-2);

        const inputToChangeCashAmount = copy(input);
        inputToChangeCashAmount.cashTransaction.amount = 2;

        const updatedDocumentWithFeesAndChangedCashAmount = reducer(
            updatedDocumentWithFees,
            creators.editGroupTransaction(inputToChangeCashAmount),
        );

        const cashAssetWithFeesAndChangedCashAmount =
            updatedDocumentWithFeesAndChangedCashAmount.state.global
                .portfolio[0] as Cash;

        expect(cashAssetWithFeesAndChangedCashAmount.balance).toBe(-3);

        const inputToChangeType = copy(input);
        inputToChangeType.type = PRINCIPAL_DRAW;

        const updatedDocumentWithFeesAndChangedType = reducer(
            updatedDocumentWithFees,
            creators.editGroupTransaction(inputToChangeType),
        );

        const cashAssetWithFeesAndChangedType =
            updatedDocumentWithFeesAndChangedType.state.global
                .portfolio[0] as Cash;

        expect(cashAssetWithFeesAndChangedType.balance).toBe(0);

        const inputToDelete = copy(input);

        const updatedDocumentWithFeesAndDeleted = reducer(
            updatedDocumentWithFees,
            creators.deleteGroupTransaction(inputToDelete),
        );

        const cashAssetAfterDelete = updatedDocumentWithFeesAndDeleted.state
            .global.portfolio[0] as Cash;

        expect(cashAssetAfterDelete.balance).toBe(0);
    });

    test('Interest income transaction', () => {
        const input = generateMock(z.GroupTransactionSchema());
        input.type = INTEREST_INCOME;
        const { mockCashTransaction, mockTransactionFee } = mocks;
        input.fees = null;
        input.cashTransaction = mockCashTransaction;
        input.cashTransaction.amount = 1;
        input.fixedIncomeTransaction = null;

        // without fees
        const updatedDocumentWithoutFees = reducer(
            document,
            creators.createGroupTransaction(input),
        );

        const cashAsset = updatedDocumentWithoutFees.state.global
            .portfolio[0] as Cash;

        expect(cashAsset.balance).toBe(1);

        // with fees
        input.fees = [mockTransactionFee];

        const updatedDocumentWithFees = reducer(
            document,
            creators.createGroupTransaction(input),
        );

        const cashAssetWithFees = updatedDocumentWithFees.state.global
            .portfolio[0] as Cash;

        expect(cashAssetWithFees.balance).toBe(0);

        const inputToChangeCashAmount = copy(input);
        inputToChangeCashAmount.cashTransaction.amount = 2;

        const updatedDocumentWithFeesAndChangedCashAmount = reducer(
            updatedDocumentWithFees,
            creators.editGroupTransaction(inputToChangeCashAmount),
        );

        const cashAssetWithFeesAndChangedCashAmount =
            updatedDocumentWithFeesAndChangedCashAmount.state.global
                .portfolio[0] as Cash;

        expect(cashAssetWithFeesAndChangedCashAmount.balance).toBe(1);

        const inputToChangeType = copy(input);
        inputToChangeType.type = INTEREST_PAYMENT;

        const updatedDocumentWithFeesAndChangedType = reducer(
            updatedDocumentWithFees,
            creators.editGroupTransaction(inputToChangeType),
        );

        const cashAssetWithFeesAndChangedType =
            updatedDocumentWithFeesAndChangedType.state.global
                .portfolio[0] as Cash;

        expect(cashAssetWithFeesAndChangedType.balance).toBe(-2);

        const inputToDelete = copy(input);

        const updatedDocumentWithFeesAndDeleted = reducer(
            updatedDocumentWithFees,
            creators.deleteGroupTransaction(inputToDelete),
        );

        const cashAssetAfterDelete = updatedDocumentWithFeesAndDeleted.state
            .global.portfolio[0] as Cash;

        expect(cashAssetAfterDelete.balance).toBe(0);
    });

    test('Interest payment transaction', () => {
        const input = generateMock(z.GroupTransactionSchema());
        input.type = INTEREST_PAYMENT;
        const { mockCashTransaction, mockTransactionFee } = mocks;
        input.fees = null;
        input.cashTransaction = mockCashTransaction;
        input.cashTransaction.amount = 1;
        input.fixedIncomeTransaction = null;

        // without fees
        const updatedDocumentWithoutFees = reducer(
            document,
            creators.createGroupTransaction(input),
        );

        const cashAsset = updatedDocumentWithoutFees.state.global
            .portfolio[0] as Cash;

        expect(cashAsset.balance).toBe(-1);

        // with fees
        input.fees = [mockTransactionFee];

        const updatedDocumentWithFees = reducer(
            document,
            creators.createGroupTransaction(input),
        );

        const cashAssetWithFees = updatedDocumentWithFees.state.global
            .portfolio[0] as Cash;

        expect(cashAssetWithFees.balance).toBe(-2);

        const inputToChangeCashAmount = copy(input);
        inputToChangeCashAmount.cashTransaction.amount = 2;

        const updatedDocumentWithFeesAndChangedCashAmount = reducer(
            updatedDocumentWithFees,
            creators.editGroupTransaction(inputToChangeCashAmount),
        );

        const cashAssetWithFeesAndChangedCashAmount =
            updatedDocumentWithFeesAndChangedCashAmount.state.global
                .portfolio[0] as Cash;

        expect(cashAssetWithFeesAndChangedCashAmount.balance).toBe(-3);

        const inputToChangeType = copy(input);
        inputToChangeType.type = INTEREST_INCOME;

        const updatedDocumentWithFeesAndChangedType = reducer(
            updatedDocumentWithFees,
            creators.editGroupTransaction(inputToChangeType),
        );

        const cashAssetWithFeesAndChangedType =
            updatedDocumentWithFeesAndChangedType.state.global
                .portfolio[0] as Cash;

        expect(cashAssetWithFeesAndChangedType.balance).toBe(0);

        const inputToDelete = copy(input);

        const updatedDocumentWithFeesAndDeleted = reducer(
            updatedDocumentWithFees,
            creators.deleteGroupTransaction(inputToDelete),
        );

        const cashAssetAfterDelete = updatedDocumentWithFeesAndDeleted.state
            .global.portfolio[0] as Cash;

        expect(cashAssetAfterDelete.balance).toBe(0);
    });

    test('Fees income transaction', () => {
        const input = generateMock(z.GroupTransactionSchema());
        input.type = FEES_INCOME;
        const { mockCashTransaction, mockServiceProvider } = mocks;
        input.fees = null;
        input.cashTransaction = mockCashTransaction;
        input.cashTransaction.amount = 1;
        input.fixedIncomeTransaction = null;
        input.serviceProviderFeeTypeId = mockServiceProvider.id;

        // without fees
        const updatedDocument = reducer(
            document,
            creators.createGroupTransaction(input),
        );

        const cashAsset = updatedDocument.state.global.portfolio[0] as Cash;

        expect(cashAsset.balance).toBe(1);

        const inputToChangeCashAmount = copy(input);
        inputToChangeCashAmount.cashTransaction.amount = 2;

        const updatedDocumentWithFeesAndChangedCashAmount = reducer(
            updatedDocument,
            creators.editGroupTransaction(inputToChangeCashAmount),
        );

        const cashAssetWithFeesAndChangedCashAmount =
            updatedDocumentWithFeesAndChangedCashAmount.state.global
                .portfolio[0] as Cash;

        expect(cashAssetWithFeesAndChangedCashAmount.balance).toBe(2);

        const inputToChangeType = copy(input);
        inputToChangeType.type = FEES_PAYMENT;

        const updatedDocumentAndChangedType = reducer(
            updatedDocument,
            creators.editGroupTransaction(inputToChangeType),
        );

        const cashAssetWithFeesAndChangedType = updatedDocumentAndChangedType
            .state.global.portfolio[0] as Cash;

        expect(cashAssetWithFeesAndChangedType.balance).toBe(-1);

        const inputToDelete = copy(input);

        const updatedDocumentAndDeleted = reducer(
            updatedDocument,
            creators.deleteGroupTransaction(inputToDelete),
        );

        const cashAssetAfterDelete = updatedDocumentAndDeleted.state.global
            .portfolio[0] as Cash;

        expect(cashAssetAfterDelete.balance).toBe(0);
    });

    test('Fees payment transaction', () => {
        const input = generateMock(z.GroupTransactionSchema());
        input.type = FEES_PAYMENT;
        const { mockCashTransaction, mockServiceProvider } = mocks;
        input.fees = null;
        input.cashTransaction = mockCashTransaction;
        input.cashTransaction.amount = 1;
        input.fixedIncomeTransaction = null;
        input.serviceProviderFeeTypeId = mockServiceProvider.id;

        const updatedDocument = reducer(
            document,
            creators.createGroupTransaction(input),
        );

        const cashAsset = updatedDocument.state.global.portfolio[0] as Cash;

        expect(cashAsset.balance).toBe(-1);

        const inputToChangeCashAmount = copy(input);
        inputToChangeCashAmount.cashTransaction.amount = 2;

        const updatedDocumentWithFeesAndChangedCashAmount = reducer(
            updatedDocument,
            creators.editGroupTransaction(inputToChangeCashAmount),
        );

        const cashAssetWithFeesAndChangedCashAmount =
            updatedDocumentWithFeesAndChangedCashAmount.state.global
                .portfolio[0] as Cash;

        expect(cashAssetWithFeesAndChangedCashAmount.balance).toBe(-2);

        const inputToChangeType = copy(input);
        inputToChangeType.type = FEES_INCOME;

        const updatedDocumentAndChangedType = reducer(
            updatedDocument,
            creators.editGroupTransaction(inputToChangeType),
        );

        const cashAssetWithFeesAndChangedType = updatedDocumentAndChangedType
            .state.global.portfolio[0] as Cash;

        expect(cashAssetWithFeesAndChangedType.balance).toBe(1);

        const inputToDelete = copy(input);

        const updatedDocumentAndDeleted = reducer(
            updatedDocument,
            creators.deleteGroupTransaction(inputToDelete),
        );

        const cashAssetAfterDelete = updatedDocumentAndDeleted.state.global
            .portfolio[0] as Cash;

        expect(cashAssetAfterDelete.balance).toBe(0);
    });

    test('Create interest income transaction', () => {
        const input = generateMock(z.GroupTransactionSchema());
        input.type = INTEREST_INCOME;
        const { mockCashTransaction, mockTransactionFee } = mocks;
        input.fees = null;
        input.cashTransaction = mockCashTransaction;
        input.cashTransaction.amount = 1;
        input.fixedIncomeTransaction = null;

        // without fees
        const updatedDocumentWithoutFees = reducer(
            document,
            creators.createGroupTransaction(input),
        );

        const cashAsset = updatedDocumentWithoutFees.state.global
            .portfolio[0] as Cash;

        expect(cashAsset.balance).toBe(1);

        // with fees
        input.fees = [mockTransactionFee];

        const updatedDocumentWithFees = reducer(
            document,
            creators.createGroupTransaction(input),
        );

        const cashAssetWithFees = updatedDocumentWithFees.state.global
            .portfolio[0] as Cash;

        expect(cashAssetWithFees.balance).toBe(0);
    });

    test('Create interest payment transaction', () => {
        const input = generateMock(z.GroupTransactionSchema());
        input.type = INTEREST_PAYMENT;
        const { mockCashTransaction, mockTransactionFee } = mocks;
        input.fees = null;
        input.cashTransaction = mockCashTransaction;
        input.cashTransaction.amount = 1;
        input.fixedIncomeTransaction = null;

        // without fees
        const updatedDocumentWithoutFees = reducer(
            document,
            creators.createGroupTransaction(input),
        );

        const cashAsset = updatedDocumentWithoutFees.state.global
            .portfolio[0] as Cash;

        expect(cashAsset.balance).toBe(-1);

        // with fees
        input.fees = [mockTransactionFee];

        const updatedDocumentWithFees = reducer(
            document,
            creators.createGroupTransaction(input),
        );

        const cashAssetWithFees = updatedDocumentWithFees.state.global
            .portfolio[0] as Cash;

        expect(cashAssetWithFees.balance).toBe(-2);
    });

    test('Fee updates', () => {
        const input = generateMock(z.TransactionFeeSchema());
        const { mockGroupTransaction, mockServiceProvider } = mocks;
        mockGroupTransaction.fees = null;
        input.id = mockGroupTransaction.id;
        input.serviceProviderFeeTypeId = mockServiceProvider.id;
        input.amount = 1;

        mockGroupTransaction.type = FEES_INCOME;

        const documentNotAllowedToAddFees1 = reducer(
            document,
            creators.createGroupTransaction(mockGroupTransaction),
        );

        const feesNotAdded1 = reducer(
            documentNotAllowedToAddFees1,
            creators.addFeesToGroupTransaction(input),
        );

        const cashAsset1 = feesNotAdded1.state.global.portfolio[0] as Cash;

        expect(cashAsset1.balance).toBe(1);

        mockGroupTransaction.type = FEES_PAYMENT;

        const documentNotAllowedToAddFees2 = reducer(
            document,
            creators.createGroupTransaction(mockGroupTransaction),
        );

        const feesNotAdded2 = reducer(
            documentNotAllowedToAddFees2,
            creators.addFeesToGroupTransaction(input),
        );

        const cashAsset2 = feesNotAdded2.state.global.portfolio[0] as Cash;

        expect(cashAsset2.balance).toBe(-1);

        const positiveTransactionTypes = [
            INTEREST_INCOME,
            PRINCIPAL_DRAW,
            ASSET_SALE,
        ] as const;

        for (const type of positiveTransactionTypes) {
            mockGroupTransaction.type = type;

            const txAdded = reducer(
                document,
                creators.createGroupTransaction(mockGroupTransaction),
            );

            let cashAsset = txAdded.state.global.portfolio[0] as Cash;

            expect(cashAsset.balance).toBe(1);

            const fees = [input];

            const feesAdded = reducer(
                txAdded,
                creators.addFeesToGroupTransaction({
                    id: mockGroupTransaction.id,
                    fees,
                }),
            );

            cashAsset = feesAdded.state.global.portfolio[0] as Cash;

            expect(cashAsset.balance).toBe(0);

            const inputToChangeAmount = copy(input);
            inputToChangeAmount.amount = 2;
            const feesToChange = [inputToChangeAmount];

            const feesAmountChanged = reducer(
                feesAdded,
                creators.editGroupTransactionFees({
                    id: mockGroupTransaction.id,
                    fees: feesToChange,
                }),
            );

            cashAsset = feesAmountChanged.state.global.portfolio[0] as Cash;

            expect(cashAsset.balance).toBe(-1);

            const feesRemoved = reducer(
                feesAdded,
                creators.removeFeesFromGroupTransaction({
                    id: mockGroupTransaction.id,
                    feeIds: [input.id],
                }),
            );

            cashAsset = feesRemoved.state.global.portfolio[0] as Cash;

            expect(cashAsset.balance).toBe(1);
        }

        const negativeTransactionTypes = [
            INTEREST_PAYMENT,
            PRINCIPAL_RETURN,
            ASSET_PURCHASE,
        ] as const;

        for (const type of negativeTransactionTypes) {
            mockGroupTransaction.type = type;

            const txAdded = reducer(
                document,
                creators.createGroupTransaction(mockGroupTransaction),
            );

            let cashAsset = txAdded.state.global.portfolio[0] as Cash;

            expect(cashAsset.balance).toBe(-1);

            const fees = [input];

            const feesAdded = reducer(
                txAdded,
                creators.addFeesToGroupTransaction({
                    id: mockGroupTransaction.id,
                    fees,
                }),
            );

            cashAsset = feesAdded.state.global.portfolio[0] as Cash;

            expect(cashAsset.balance).toBe(-2);

            const inputToChangeAmount = copy(input);
            inputToChangeAmount.amount = 2;
            const feesToChange = [inputToChangeAmount];

            const feesAmountChanged = reducer(
                feesAdded,
                creators.editGroupTransactionFees({
                    id: mockGroupTransaction.id,
                    fees: feesToChange,
                }),
            );

            cashAsset = feesAmountChanged.state.global.portfolio[0] as Cash;

            expect(cashAsset.balance).toBe(-3);

            const feesRemoved = reducer(
                feesAdded,
                creators.removeFeesFromGroupTransaction({
                    id: mockGroupTransaction.id,
                    feeIds: [input.id],
                }),
            );

            cashAsset = feesRemoved.state.global.portfolio[0] as Cash;

            expect(cashAsset.balance).toBe(-1);
        }
    });
});
