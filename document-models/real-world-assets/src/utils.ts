import { noCase } from 'change-case';
import { z } from 'zod';
import {
    Asset,
    BaseTransaction,
    Cash,
    FixedIncome,
    GroupTransactionType,
    InputMaybe,
    RealWorldAssetsState,
} from '..';
import {
    allPossibleAllowedTransactions,
    groupTransactionTypesToAllowedTransactions,
} from './constants';

export const dateValidator = z.coerce.date();

const numberValidator = z.number();

export function validateHasCorrectTransactions(
    groupTransactionType: GroupTransactionType,
    transactionsInput: {
        cashTransaction?: InputMaybe<BaseTransaction>;
        fixedIncomeTransaction?: InputMaybe<BaseTransaction>;
        interestTransaction?: InputMaybe<BaseTransaction>;
        feeTransactions?: InputMaybe<InputMaybe<BaseTransaction>[]>;
    },
) {
    const allowedTransaction =
        groupTransactionTypesToAllowedTransactions[groupTransactionType];
    const notAllowedTransactions = allPossibleAllowedTransactions.filter(
        tx => tx !== allowedTransaction,
    );
    notAllowedTransactions.forEach(tx => {
        if (transactionsInput[tx]) {
            throw new Error(
                `Group transaction of type ${groupTransactionType} cannot have a ${noCase(tx)} transaction`,
            );
        }
    });
}

export function isFixedIncomeAsset(
    asset: Asset | undefined | null,
): asset is FixedIncome {
    if (!asset) return false;
    return 'fixedIncomeTypeId' in asset;
}

export function isCashAsset(asset: Asset | undefined | null): asset is Cash {
    if (!asset) return false;
    return 'currency' in asset;
}

export function validateBaseTransaction(
    state: RealWorldAssetsState,
    input: InputMaybe<BaseTransaction>,
) {
    if (!input?.id) {
        throw new Error(`Transaction must have an id`);
    }
    if (state.transactions.find(transaction => transaction.id === input.id)) {
        throw new Error(`Transaction with id ${input.id} already exists!`);
    }
    if (!input.assetId) {
        throw new Error(`Transaction must have an asset`);
    }
    if (!state.portfolio.find(asset => asset.id === input.assetId)) {
        throw new Error(`Asset with id ${input.assetId} does not exist!`);
    }
    if (!input.amount) {
        throw new Error(`Transaction must have an amount`);
    }
    if (!input.entryTime) {
        throw new Error(`Transaction must have an entry time`);
    }

    if (!dateValidator.safeParse(input.entryTime).success) {
        throw new Error(`Entry time must be a valid date`);
    }
    if (input.tradeTime && !dateValidator.safeParse(input.tradeTime).success) {
        throw new Error(`Trade time must be a valid date`);
    }
    if (
        input.settlementTime &&
        !dateValidator.safeParse(input.settlementTime).success
    ) {
        throw new Error(`Settlement time must be a valid date`);
    }
    if (
        input.accountId &&
        !state.accounts.find(a => a.id === input.accountId)
    ) {
        throw new Error(`Account with id ${input.accountId} does not exist!`);
    }
    if (
        input.counterPartyAccountId &&
        !state.accounts.find(a => a.id === input.counterPartyAccountId)
    ) {
        throw new Error(
            `Counter party account with id ${input.counterPartyAccountId} does not exist!`,
        );
    }
}

export function validateFixedIncomeTransaction(
    state: RealWorldAssetsState,
    transaction: InputMaybe<BaseTransaction>,
) {
    if (
        !isFixedIncomeAsset(
            state.portfolio.find(a => a.id === transaction?.assetId),
        )
    ) {
        throw new Error(
            `Fixed income transaction must have a fixed income asset as the asset`,
        );
    }
}

export function validateCashTransaction(
    state: RealWorldAssetsState,
    transaction: InputMaybe<BaseTransaction>,
) {
    if (transaction?.counterPartyAccountId !== state.principalLenderAccountId) {
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
    transaction: InputMaybe<BaseTransaction>,
) {
    if (
        !isFixedIncomeAsset(
            state.portfolio.find(a => a.id === transaction?.assetId),
        )
    ) {
        throw new Error(
            `Interest transaction must have a fixed income asset as the asset`,
        );
    }
    if (!transaction?.counterPartyAccountId) {
        throw new Error(
            `Interest transaction must have a counter party account`,
        );
    }
    if (
        !state.feeTypes.find(
            a => a.accountId === transaction.counterPartyAccountId,
        )
    ) {
        throw new Error(
            `Counter party with id ${transaction.counterPartyAccountId} must be a known service provider`,
        );
    }
    if (!numberValidator.positive().safeParse(transaction.amount).success) {
        throw new Error('Interest transaction amount must be positive');
    }
}

export function validateFeeTransaction(
    state: RealWorldAssetsState,
    transaction: InputMaybe<BaseTransaction>,
) {
    if (
        !isFixedIncomeAsset(
            state.portfolio.find(a => a.id === transaction?.assetId),
        )
    ) {
        throw new Error(
            `Fee transaction must have a fixed income asset as the asset`,
        );
    }
    if (!transaction?.counterPartyAccountId) {
        throw new Error(`Fee transaction must have a counter party account`);
    }
    if (
        !state.feeTypes.find(
            a => a.accountId === transaction.counterPartyAccountId,
        )
    ) {
        throw new Error(
            `Counter party with id ${transaction.counterPartyAccountId} must be a known service provider`,
        );
    }
    if (!numberValidator.negative().safeParse(transaction.amount).success) {
        throw new Error('Fee transaction amount must be negative');
    }
}

export function validateFixedIncomeAsset(
    state: RealWorldAssetsState,
    asset: InputMaybe<Asset>,
) {
    if (!isFixedIncomeAsset(asset)) {
        throw new Error(`Asset with id ${asset?.id} does not exist!`);
    }
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
    // todo: add validation for `name` field
    if (asset.spvId && !state.spvs.find(spv => spv.id === asset.spvId)) {
        throw new Error(`SPV with id ${asset.spvId} does not exist!`);
    }
    if (asset.maturity && !dateValidator.safeParse(asset.maturity).success) {
        throw new Error(`Maturity must be a valid date`);
    }
}
