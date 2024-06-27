import {
    allGroupTransactionTypes,
    assetGroupTransactions,
    groupTransactionTypeLabels,
} from '@/rwa';

export type RealWorldAssetsState = {
    accounts: Account[];
    fixedIncomeTypes: FixedIncomeType[];
    portfolio: Asset[];
    principalLenderAccountId: string;
    serviceProviderFeeTypes: ServiceProviderFeeType[];
    spvs: SPV[];
    transactions: GroupTransaction[];
};

export type AssetType = 'Cash' | 'FixedIncome';

export type FixedIncome = {
    // editable fields
    id: string;
    name: string;
    fixedIncomeTypeId: string;
    spvId: string;
    maturity: string | null;
    ISIN?: string | null;
    CUSIP?: string | null;
    coupon?: number | null;
    // derived fields
    type: AssetType;
    notional: number;
    purchaseDate: string;
    purchasePrice: number;
    purchaseProceeds: number;
    totalDiscount: number;
    realizedSurplus: number;
    salesProceeds: number;
};

export type CashAsset = {
    id: string;
    type: AssetType;
    spvId: string;
    currency: string;
    balance: number;
};

export type Asset = CashAsset | FixedIncome;

export type FixedIncomeType = {
    id: string;
    name: string;
};

export type SPV = {
    id: string;
    name: string;
};

export type AssetGroupTransactionType = (typeof assetGroupTransactions)[number];

export type GroupTransactionType = (typeof allGroupTransactionTypes)[number];

export type GroupTransactionTypeLabel =
    (typeof groupTransactionTypeLabels)[keyof typeof groupTransactionTypeLabels];

export type GroupTransaction = {
    id: string;
    type: GroupTransactionType;
    cashBalanceChange: number;
    entryTime: string;
    serviceProviderFeeTypeId?: string | null;
    txRef?: string | null;
    fees?: TransactionFee[] | null;
    fixedIncomeTransaction?: BaseTransaction | null;
    cashTransaction?: BaseTransaction | null;
};

export type TransactionFee = {
    id: string;
    amount: number;
    serviceProviderFeeTypeId: string;
};

export type BaseTransaction = {
    id: string;
    assetId: string;
    amount: number;
    entryTime: string;
    tradeTime?: string | null;
    settlementTime?: string | null;
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
