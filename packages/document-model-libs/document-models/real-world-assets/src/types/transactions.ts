import { BaseTransaction, GroupTransaction, TransactionFee } from '../../gen';
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

export type BaseTransactionCommonFields = Pick<
    BaseTransaction,
    | 'id'
    | 'assetType'
    | 'assetId'
    | 'amount'
    | 'entryTime'
    | 'accountId'
    | 'settlementTime'
    | 'tradeTime'
>;

export type FixedIncomeBaseTransaction = BaseTransactionCommonFields;

export type CashBaseTransaction = BaseTransactionCommonFields & {
    counterPartyAccountId: string;
};

export type InterestBaseTransaction = BaseTransactionCommonFields & {
    counterPartyAccountId: string;
};

export type FeesBaseTransaction = BaseTransactionCommonFields;

export type GroupTransactionCommonFields = Pick<
    GroupTransaction,
    'id' | 'entryTime' | 'cashBalanceChange'
>;

export type AssetGroupTransaction = GroupTransactionCommonFields & {
    type: typeof ASSET_PURCHASE | typeof ASSET_SALE;
    unitPrice: number;
    fees: TransactionFee[];
    fixedIncomeTransaction: FixedIncomeBaseTransaction;
    cashTransaction: CashBaseTransaction;
};

export type PrincipalGroupTransaction = GroupTransactionCommonFields & {
    type: typeof PRINCIPAL_DRAW | typeof PRINCIPAL_RETURN;
    fees: TransactionFee[];
    cashTransaction: CashBaseTransaction;
};

export type InterestGroupTransaction = GroupTransactionCommonFields & {
    type: typeof INTEREST_PAYMENT | typeof INTEREST_INCOME;
    fees: TransactionFee[];
    cashTransaction: InterestBaseTransaction;
};

export type FeesGroupTransaction = GroupTransactionCommonFields & {
    type: typeof FEES_PAYMENT | typeof FEES_INCOME;
    cashTransaction: FeesBaseTransaction;
    serviceProviderFeeTypeId: string;
};
