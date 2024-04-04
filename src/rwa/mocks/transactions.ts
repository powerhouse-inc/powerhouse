import { mockFixedIncomes, mockPrincipalLenderAccountId } from '.';
import { allGroupTransactionTypes } from '../constants/transactions';

export const mockFixedIncomeTransaction = {
    id: 'fixed-income-transaction-1',
    assetId: mockFixedIncomes[0].id,
    amount: 1000,
    entryTime: '2021-10-01',
};

export const mockCashTransaction = {
    id: 'cash-transaction-1',
    assetId: 'cash-asset-1',
    amount: 1000,
    entryTime: '2021-10-01',
    counterPartyAccountId: mockPrincipalLenderAccountId,
};

export const mockGroupTransaction = {
    id: 'group-transaction-0',
    type: allGroupTransactionTypes[0],
    entryTime: '2021-10-01 00:00:00',
    fees: [
        {
            id: 'fee-transaction-1',
            amount: 100,
            serviceProviderFeeTypeId: '1',
        },
        {
            id: 'fee-transaction-2',
            amount: 200,
            serviceProviderFeeTypeId: '2',
        },
        {
            id: 'fee-transaction-3',
            amount: 300,
            serviceProviderFeeTypeId: '3',
        },
    ],
    cashTransaction: mockCashTransaction,
    fixedIncomeTransaction: mockFixedIncomeTransaction,
    feeTransactions: [],
    interestTransaction: null,
};

export const mockGroupTransactions = Array.from({ length: 10 }, (_, i) => ({
    ...mockGroupTransaction,
    cashBalanceChange: i % 2 === 0 ? 1000 : -1000,
    id: `group-transaction-${i}`,
}));
