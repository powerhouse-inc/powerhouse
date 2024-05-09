import { InputMaybe } from 'document-model/document-model';
import { z } from 'zod';
import {
    Asset,
    BaseTransaction,
    BaseTransactionInput,
    Cash,
    EditGroupTransactionInput,
    EditTransactionFeeInput,
    FixedIncome,
    RealWorldAssetsState,
    TransactionFee,
} from '../..';
import {
    ASSET_PURCHASE,
    ASSET_SALE,
    FEES_PAYMENT,
    PRINCIPAL_DRAW,
    PRINCIPAL_RETURN,
} from '../constants';
import {
    AssetGroupTransaction,
    CashBaseTransaction,
    FeesBaseTransaction,
    FeesPaymentGroupTransaction,
    FixedIncomeBaseTransaction,
    InterestBaseTransaction,
    PrincipalGroupTransaction,
} from '../types';

export const dateValidator = z.coerce.date();

export const numberValidator = z.number();

export function isFixedIncomeAsset(
    asset: Asset | undefined | null,
): asset is FixedIncome {
    if (!asset) return false;
    if (asset.type === 'FixedIncome') return true;
    if ('fixedIncomeId' in asset) return true;
    return false;
}

export function isCashAsset(asset: Asset | undefined | null): asset is Cash {
    if (!asset) return false;
    if (asset.type === 'Cash') return true;
    if ('currency' in asset) return true;
    return false;
}

export function isAssetGroupTransaction(
    transaction: Partial<EditGroupTransactionInput>,
): transaction is AssetGroupTransaction {
    if (!transaction.type) return false;
    if (![ASSET_PURCHASE, ASSET_SALE].includes(transaction.type)) return false;
    if (!('unitPrice' in transaction)) return false;
    if (!('fees' in transaction)) return false;
    if (!('fixedIncomeTransaction' in transaction)) return false;
    return true;
}

export function validateGroupTransaction(
    transaction: Partial<EditGroupTransactionInput>,
) {
    if (!transaction.id) {
        throw new Error(`Transaction must have an id`);
    }
    if (!transaction.type) {
        throw new Error(`Transaction must have a type`);
    }
    if (!transaction.entryTime) {
        throw new Error(`Transaction must have an entry time`);
    }
    if (!dateValidator.safeParse(transaction.entryTime).success) {
        throw new Error(`Entry time must be a valid date`);
    }
    if (!transaction.cashBalanceChange) {
        throw new Error(`Transaction must have a cash balance change`);
    }
    if (!numberValidator.safeParse(transaction.cashBalanceChange).success) {
        throw new Error(`Cash balance change must be a number`);
    }
}

export function validateAssetGroupTransaction(
    transaction: AssetGroupTransaction,
    state: RealWorldAssetsState,
) {
    if (!numberValidator.safeParse(transaction.unitPrice).success) {
        throw new Error(`Unit price must be a number`);
    }
    if (!numberValidator.positive().safeParse(transaction.unitPrice).success) {
        throw new Error(`Unit price must be positive`);
    }
    validateGroupTransaction(transaction);
    validateCashTransaction(state, transaction.cashTransaction);
    validateFixedIncomeTransaction(state, transaction.fixedIncomeTransaction);
    validateTransactionFees(state, transaction.fees);
}

export function isPrincipalGroupTransaction(
    transaction: Partial<EditGroupTransactionInput>,
): transaction is PrincipalGroupTransaction {
    if (!transaction.type) return false;
    if (![PRINCIPAL_DRAW, PRINCIPAL_RETURN].includes(transaction.type))
        return false;
    if (!('fees' in transaction)) return false;
    return true;
}

export function validatePrincipalGroupTransaction(
    transaction: PrincipalGroupTransaction,
    state: RealWorldAssetsState,
) {
    validateGroupTransaction(transaction);
    validateCashTransaction(state, transaction.cashTransaction);
    validateTransactionFees(state, transaction.fees);
}

export function isInterestPaymentGroupTransaction(
    transaction: Partial<EditGroupTransactionInput>,
): transaction is PrincipalGroupTransaction {
    if (!transaction.type) return false;
    if (transaction.type !== PRINCIPAL_RETURN) return false;
    if (!('fees' in transaction)) return false;
    return true;
}

export function validateInterestPaymentGroupTransaction(
    transaction: PrincipalGroupTransaction,
    state: RealWorldAssetsState,
) {
    validateGroupTransaction(transaction);
    validateInterestTransaction(state, transaction.cashTransaction);
    validateTransactionFees(state, transaction.fees);
}

export function isFeesPaymentGroupTransaction(
    transaction: Partial<EditGroupTransactionInput>,
): transaction is FeesPaymentGroupTransaction {
    if (!transaction.type) return false;
    if (transaction.type !== FEES_PAYMENT) return false;
    if ('fees' in transaction) return false;
    return true;
}

export function validateFeesPaymentGroupTransaction(
    transaction: FeesPaymentGroupTransaction,
    state: RealWorldAssetsState,
) {
    validateGroupTransaction(transaction);
    validateFeeBaseTransaction(state, transaction.cashTransaction);
}

export function validateTransactionFee(
    state: RealWorldAssetsState,
    fee: InputMaybe<EditTransactionFeeInput>,
): asserts fee is TransactionFee {
    if (!fee) {
        throw new Error('Fee does not exist');
    }
    if (!fee.serviceProviderFeeTypeId) {
        throw new Error(`Transaction fee must have a service provider`);
    }
    if (!fee.amount) {
        throw new Error(`Transaction fee must have an amount`);
    }

    if (
        fee.serviceProviderFeeTypeId &&
        !state.serviceProviderFeeTypes.find(
            serviceProvider =>
                serviceProvider.id === fee.serviceProviderFeeTypeId,
        )
    ) {
        throw new Error(
            `Service provider with account id ${fee.serviceProviderFeeTypeId} does not exist!`,
        );
    }
    if (!numberValidator.safeParse(fee.amount).success) {
        throw new Error(`Fee amount must be a number`);
    }
}

export function validateTransactionFees(
    state: RealWorldAssetsState,
    fees: InputMaybe<EditTransactionFeeInput[]>,
): asserts fees is TransactionFee[] {
    if (!Array.isArray(fees)) {
        throw new Error(`Transaction fees must be an array`);
    }
    fees.forEach(fee => {
        validateTransactionFee(state, fee);
    });
}

export function validateBaseTransaction(
    state: RealWorldAssetsState,
    transaction: BaseTransactionInput,
): asserts transaction is BaseTransaction {
    if (!transaction.assetId) {
        throw new Error(`Transaction must have an asset`);
    }
    if (!state.portfolio.find(asset => asset.id === transaction.assetId)) {
        throw new Error(`Asset with id ${transaction.assetId} does not exist!`);
    }
    if (!transaction.amount) {
        throw new Error(`Transaction must have an amount`);
    }
    if (!numberValidator.positive().safeParse(transaction.amount).success) {
        throw new Error('Transaction amount must be positive');
    }
    if (!transaction.entryTime) {
        throw new Error(`Transaction must have an entry time`);
    }

    if (!dateValidator.safeParse(transaction.entryTime).success) {
        throw new Error(`Entry time must be a valid date`);
    }
    if (
        transaction.tradeTime &&
        !dateValidator.safeParse(transaction.tradeTime).success
    ) {
        throw new Error(`Trade time must be a valid date`);
    }
    if (
        transaction.settlementTime &&
        !dateValidator.safeParse(transaction.settlementTime).success
    ) {
        throw new Error(`Settlement time must be a valid date`);
    }
    if (
        transaction.accountId &&
        !state.accounts.find(a => a.id === transaction.accountId)
    ) {
        throw new Error(
            `Account with id ${transaction.accountId} does not exist!`,
        );
    }
    if (
        transaction.counterPartyAccountId &&
        !state.accounts.find(a => a.id === transaction.counterPartyAccountId)
    ) {
        throw new Error(
            `Counter party account with id ${transaction.counterPartyAccountId} does not exist!`,
        );
    }
}

export function validateFixedIncomeTransaction(
    state: RealWorldAssetsState,
    transaction: BaseTransactionInput,
): asserts transaction is FixedIncomeBaseTransaction {
    if (transaction.assetType !== 'FixedIncome') {
        throw new Error(
            `Fixed income transaction must have a fixed income type`,
        );
    }
    validateBaseTransaction(state, transaction);
    if (
        !isFixedIncomeAsset(
            state.portfolio.find(a => a.id === transaction.assetId),
        )
    ) {
        throw new Error(
            `Fixed income transaction must have a fixed income type`,
        );
    }
}

export function validateCashTransaction(
    state: RealWorldAssetsState,
    transaction: BaseTransactionInput,
): asserts transaction is CashBaseTransaction {
    if (transaction.assetType !== 'Cash') {
        throw new Error(`Cash transaction must have a cash type`);
    }
    validateBaseTransaction(state, transaction);
    if (transaction.counterPartyAccountId !== state.principalLenderAccountId) {
        throw new Error(
            `Cash transaction must have Maker principal lender as the counter party`,
        );
    }
    if (!isCashAsset(state.portfolio.find(a => a.id === transaction.assetId))) {
        throw new Error(`Cash transaction must have a cash asset as the asset`);
    }
}

export function validateInterestTransaction(
    state: RealWorldAssetsState,
    transaction: BaseTransactionInput,
): asserts transaction is InterestBaseTransaction {
    if (transaction.assetType !== 'Cash') {
        throw new Error(`Interest transaction must have a cash type`);
    }
    validateBaseTransaction(state, transaction);
    if (
        !isFixedIncomeAsset(
            state.portfolio.find(a => a.id === transaction.assetId),
        )
    ) {
        throw new Error(
            `Interest transaction must have a fixed income asset as the asset`,
        );
    }
    if (!transaction.counterPartyAccountId) {
        throw new Error(
            `Interest transaction must have a counter party account`,
        );
    }
    if (
        !state.serviceProviderFeeTypes.find(
            a => a.accountId === transaction.counterPartyAccountId,
        )
    ) {
        throw new Error(
            `Counter party with id ${transaction.counterPartyAccountId} must be a known service provider`,
        );
    }
}

export function validateFeeBaseTransaction(
    state: RealWorldAssetsState,
    transaction: BaseTransactionInput,
): asserts transaction is FeesBaseTransaction {
    if (transaction.assetType !== 'Cash') {
        throw new Error(`Fees payment transaction must have a cash type`);
    }
    validateBaseTransaction(state, transaction);
}

export function validateFixedIncomeAsset(
    state: RealWorldAssetsState,
    asset: InputMaybe<FixedIncome>,
) {
    if (!asset) return;

    if (
        asset.fixedIncomeTypeId &&
        !state.fixedIncomeTypes.find(
            fixedIncomeType => fixedIncomeType.id === asset.fixedIncomeTypeId,
        )
    ) {
        throw new Error(
            `Fixed income type with id ${asset.fixedIncomeTypeId} does not exist!`,
        );
    }
    if (asset.spvId && !state.spvs.find(spv => spv.id === asset.spvId)) {
        throw new Error(`SPV with id ${asset.spvId} does not exist!`);
    }
    if (asset.maturity && !dateValidator.safeParse(asset.maturity).success) {
        throw new Error(`Maturity must be a valid date`);
    }
}

export function validateFixedIncomeAssetDerivedFields(
    asset: Partial<FixedIncome>,
) {
    if (
        asset.purchaseDate &&
        !dateValidator.safeParse(asset.purchaseDate).success
    ) {
        throw new Error(`Purchase date must be a valid date`);
    }
    if (asset.notional && !numberValidator.safeParse(asset.notional).success) {
        throw new Error(`Notional must be a number`);
    }
    if (
        asset.purchaseProceeds &&
        !numberValidator.safeParse(asset.purchaseProceeds).success
    ) {
        throw new Error(`Purchase proceeds must be a number`);
    }
    if (
        asset.purchasePrice &&
        !numberValidator.safeParse(asset.purchasePrice).success
    ) {
        throw new Error(`Purchase price must be a number`);
    }
    if (
        asset.totalDiscount &&
        !numberValidator.safeParse(asset.totalDiscount).success
    ) {
        throw new Error(`Total discount must be a number`);
    }
    if (
        asset.salesProceeds &&
        !numberValidator.safeParse(asset.salesProceeds).success
    ) {
        throw new Error(`Annualized yield must be a number`);
    }
    if (
        asset.realizedSurplus &&
        !numberValidator.safeParse(asset.realizedSurplus).success
    ) {
        throw new Error(`Realized surplus must be a number`);
    }
}
