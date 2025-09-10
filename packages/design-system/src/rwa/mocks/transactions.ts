import type { BaseTransaction, GroupTransaction } from "#rwa";
import {
  FEES_PAYMENT,
  allGroupTransactionTypes,
  calculateCashBalanceChange,
  isAssetGroupTransactionType,
} from "#rwa";
import {
  mockAccounts,
  mockFixedIncomes,
  mockPrincipalLenderAccountId,
} from "./assets.js";

export const mockFixedIncomeTransaction: BaseTransaction = {
  id: "fixed-income-transaction-1",
  assetId: mockFixedIncomes[1].id,
  accountId: mockAccounts[1].id,
  amount: 1000,
  entryTime: "2023-06-01T00:00:00.000Z",
  assetType: "FixedIncome",
  counterPartyAccountId: null,
  settlementTime: null,
  tradeTime: null,
};

export const mockCashTransaction: BaseTransaction = {
  id: "cash-transaction-1",
  assetId: "cash-asset-1",
  amount: 1000,
  entryTime: "2023-06-01T00:00:00.000Z",
  counterPartyAccountId: mockPrincipalLenderAccountId,
  accountId: mockPrincipalLenderAccountId,
  assetType: "Cash",
  settlementTime: null,
  tradeTime: null,
};

export const mockGroupTransaction: GroupTransaction = {
  id: "group-transaction-0",
  type: allGroupTransactionTypes[0],
  entryTime: "2023-06-01T00:00:00.000Z",
  txRef: "0x99f19e36b83f59159b917fa67282f913f6c85ecdee5f49d427048d5ed9508b0b",
  unitPrice: 1,
  fees: [
    {
      id: "fee-transaction-1",
      amount: 100,
      serviceProviderFeeTypeId: "1",
    },
    {
      id: "fee-transaction-2",
      amount: 200,
      serviceProviderFeeTypeId: "2",
    },
    {
      id: "fee-transaction-3",
      amount: 300,
      serviceProviderFeeTypeId: "3",
    },
  ],
  cashTransaction: mockCashTransaction,
  fixedIncomeTransaction: mockFixedIncomeTransaction,
  serviceProviderFeeTypeId: null,
  cashBalanceChange: 10,
};

export const mockGroupTransactions: GroupTransaction[] =
  allGroupTransactionTypes.map((type, i) => {
    const fees = type !== FEES_PAYMENT ? mockGroupTransaction.fees : null;
    const cashTransaction = mockCashTransaction;
    const fixedIncomeTransaction = isAssetGroupTransactionType(type)
      ? mockFixedIncomeTransaction
      : null;
    const cashBalanceChange = calculateCashBalanceChange(
      type,
      cashTransaction.amount,
      fees,
    );
    return {
      ...mockGroupTransaction,
      type,
      fees,
      cashBalanceChange,
      fixedIncomeTransaction,
      id: `group-transaction-${i}`,
    };
  });

export const manyMockGroupTransactions: GroupTransaction[] = [
  ...mockGroupTransactions,
  ...mockGroupTransactions,
  ...mockGroupTransactions,
  ...mockGroupTransactions,
  ...mockGroupTransactions,
  ...mockGroupTransactions,
  ...mockGroupTransactions,
  ...mockGroupTransactions,
  ...mockGroupTransactions,
  ...mockGroupTransactions,
].map((transaction, i) => ({
  ...transaction,
  id: `group-transaction-${i}`,
}));
