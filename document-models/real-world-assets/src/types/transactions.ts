import { PRINCIPAL_RETURN } from '@powerhousedao/design-system';
import { BaseTransaction, GroupTransaction, TransactionFee } from '../../gen';
import {
    ASSET_PURCHASE,
    ASSET_SALE,
    INTEREST_PAYMENT,
    PRINCIPAL_DRAW,
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
    | 'txRef'
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

export type InterestPaymentGroupTransaction = GroupTransactionCommonFields & {
    type: typeof INTEREST_PAYMENT;
    fees: TransactionFee[];
    cashTransaction: InterestBaseTransaction;
};

export type FeesPaymentGroupTransaction = GroupTransactionCommonFields & {
    type: typeof INTEREST_PAYMENT;
    cashTransaction: FeesBaseTransaction;
};
