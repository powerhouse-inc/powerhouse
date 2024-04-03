import { groupTransactionTypeLabels, groupTransactionTypes } from '@/rwa';

export type FixedIncome = {
    // editable fields
    id: string;
    name: string;
    fixedIncomeTypeId: string;
    spvId: string;
    maturity: string;
    ISIN?: string | null;
    CUSIP?: string | null;
    coupon?: number | null;
    // derived fields
    notional: number;
    purchaseDate: string;
    purchasePrice: number;
    purchaseProceeds: number;
    totalDiscount: number;
    realizedSurplus: number;
    salesProceeds: number;
};

export type FixedIncomeType = {
    id: string;
    name: string;
};

export type SPV = {
    id: string;
    name: string;
};

export type GroupTransactionType = (typeof groupTransactionTypes)[number];

export type GroupTransactionTypeLabel =
    (typeof groupTransactionTypeLabels)[keyof typeof groupTransactionTypeLabels];

export type GroupTransaction = {
    id: string;
    type: GroupTransactionType;
    cashBalanceChange: number;
    entryTime: string;
    fees?: TransactionFee[] | null;
    fixedIncomeTransaction?: BaseTransaction | null;
    cashTransaction?: BaseTransaction | null;
    feeTransactions?: BaseTransaction[] | null;
    interestTransaction?: BaseTransaction | null;
};

export type TransactionFee = {
    id: string;
    amount: number;
    serviceProviderFeeTypeId: string;
};

export type CashAsset = {
    id: string;
    spvId: string;
    currency: string;
};

export type Asset = CashAsset | FixedIncome;

export type BaseTransaction = {
    id: string;
    assetId: string;
    amount: number;
    entryTime: string;
    tradeTime?: string | null;
    settlementTime?: string | null;
    txRef?: string | null;
    accountId?: string | null;
    counterPartyAccountId?: string | null;
};

export type ServiceProviderFeeType = {
    accountId: string;
    feeType: string;
    id: string;
    name: string;
};

export type Account = {
    id: string;
    label?: string | null;
    reference: string;
};
