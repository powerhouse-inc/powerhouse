import { InputMaybe } from 'document-model/document-model';
import {
    BaseTransaction,
    BaseTransactionInput,
    EditGroupTransactionInput,
    EditTransactionFeeInput,
    GroupTransaction,
    RealWorldAssetsState,
    TransactionFee,
} from '../../..';
import {
    ASSET_PURCHASE,
    ASSET_SALE,
    FEES_INCOME,
    FEES_PAYMENT,
    INTEREST_INCOME,
    INTEREST_PAYMENT,
    PRINCIPAL_DRAW,
    PRINCIPAL_RETURN,
} from '../../constants';
import {
    AssetGroupTransaction,
    CashBaseTransaction,
    FeesGroupTransaction,
    FixedIncomeBaseTransaction,
    InterestGroupTransaction,
    PrincipalGroupTransaction,
} from '../../types';
import { isCashAsset, isFixedIncomeAsset } from '../validators/assets';
import { dateValidator, numberValidator } from '../validators/zod';

export function isAssetGroupTransaction(
    transaction: Partial<EditGroupTransactionInput>,
): transaction is AssetGroupTransaction {
    if (!transaction.type) return false;
    return [ASSET_PURCHASE, ASSET_SALE].includes(transaction.type);
}

export function isPrincipalGroupTransaction(
    transaction: Partial<EditGroupTransactionInput>,
): transaction is PrincipalGroupTransaction {
    if (!transaction.type) return false;
    return [PRINCIPAL_DRAW, PRINCIPAL_RETURN].includes(transaction.type);
}

export function isInterestGroupTransaction(
    transaction: Partial<EditGroupTransactionInput>,
): transaction is InterestGroupTransaction {
    if (!transaction.type) return false;
    return [INTEREST_PAYMENT, INTEREST_INCOME].includes(transaction.type);
}

export function isFeesGroupTransaction(
    transaction: Partial<EditGroupTransactionInput>,
): transaction is FeesGroupTransaction {
    if (!transaction.type) return false;
    return [FEES_PAYMENT, FEES_INCOME].includes(transaction.type);
}

export function validateSharedGroupTransactionFields(
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
}

export function validateGroupTransaction(
    state: RealWorldAssetsState,
    transaction: GroupTransaction,
) {
    validateSharedGroupTransactionFields(transaction);
    validateCashTransaction(state, transaction.cashTransaction);

    if (isPrincipalGroupTransaction(transaction)) {
        validatePrincipalGroupTransaction(state, transaction);
    }

    if (isAssetGroupTransaction(transaction)) {
        validateAssetGroupTransaction(state, transaction);
    }

    if (isInterestGroupTransaction(transaction)) {
        validateInterestGroupTransaction(state, transaction);
    }

    if (isFeesGroupTransaction(transaction)) {
        validateFeesGroupTransaction(state, transaction);
    }
}

export function validatePrincipalGroupTransaction(
    state: RealWorldAssetsState,
    transaction: PrincipalGroupTransaction,
) {
    validateTransactionFees(state, transaction.fees);
}

export function validateAssetGroupTransaction(
    state: RealWorldAssetsState,
    transaction: AssetGroupTransaction,
) {
    if (!('fixedIncomeTransaction' in transaction)) {
        throw new Error(
            `Asset transaction must have a fixed income transaction`,
        );
    }
    if (!('unitPrice' in transaction)) {
        throw new Error(`Asset transaction must have a unit price`);
    }
    validateFixedIncomeTransaction(state, transaction.fixedIncomeTransaction);
    validateTransactionFees(state, transaction.fees);
    if (!numberValidator.safeParse(transaction.unitPrice).success) {
        throw new Error(`Unit price must be a number`);
    }
    if (!numberValidator.positive().safeParse(transaction.unitPrice).success) {
        throw new Error(`Unit price must be positive`);
    }
}

export function validateInterestGroupTransaction(
    state: RealWorldAssetsState,
    transaction: InterestGroupTransaction,
) {
    const counterPartyAccountId =
        transaction.cashTransaction.counterPartyAccountId;
    if (!counterPartyAccountId) {
        throw new Error(
            `Interest transaction must have a counter party account`,
        );
    }

    if (transaction.type === INTEREST_PAYMENT) {
        if (counterPartyAccountId !== state.principalLenderAccountId) {
            throw new Error(
                `Interest payment must have the principal lender as the counter party`,
            );
        }
    }

    if (transaction.type === INTEREST_INCOME) {
        if (!state.accounts.find(a => a.id === counterPartyAccountId)) {
            throw new Error(
                `Counter party with account id ${counterPartyAccountId} does not exist!`,
            );
        }
    }
    validateTransactionFees(state, transaction.fees);
}

export function validateFeesGroupTransaction(
    state: RealWorldAssetsState,
    transaction: FeesGroupTransaction,
) {
    if (!transaction.serviceProviderFeeTypeId) {
        return;
    }

    const serviceProviderFeeType = state.serviceProviderFeeTypes.find(
        a => a.id === transaction.serviceProviderFeeTypeId,
    );

    if (!serviceProviderFeeType) {
        throw new Error(
            `Service provider with id ${transaction.serviceProviderFeeTypeId} does not exist!`,
        );
    }
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
            `Cash transaction must have the principal lender as the counter party`,
        );
    }
    if (!isCashAsset(state.portfolio.find(a => a.id === transaction.assetId))) {
        throw new Error(`Cash transaction must have a cash asset as the asset`);
    }
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
    if (!numberValidator.positive().safeParse(fee.amount).success) {
        throw new Error(`Fee amount must be a number`);
    }
}

export function validateTransactionFees(
    state: RealWorldAssetsState,
    fees: InputMaybe<EditTransactionFeeInput[]>,
): asserts fees is TransactionFee[] {
    if (fees === null) return;

    if (!Array.isArray(fees)) {
        throw new Error(`Transaction fees must be an array`);
    }
    fees.forEach(fee => {
        validateTransactionFee(state, fee);
    });
}
