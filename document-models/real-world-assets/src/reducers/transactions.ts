/**
 * This is a scaffold file meant for customization:
 * - modify it by implementing the reducer functions
 * - delete the file and run the code generator again to have it reset
 */

import {
    makeEmptyGroupTransactionByType,
    makeFixedIncomeAssetWithDerivedFields,
    validateCashTransaction,
    validateFeeTransaction,
    validateFeeTransactions,
    validateFixedIncomeTransaction,
    validateHasCorrectTransactions,
    validateInterestTransaction,
} from '../..';
import { RealWorldAssetsTransactionsOperations } from '../../gen/transactions/operations';
import {
    ASSET_PURCHASE,
    ASSET_SALE,
    FEES_PAYMENT,
    FEE_TRANSACTIONS,
    INTEREST_DRAW,
    INTEREST_RETURN,
    PRINCIPAL_DRAW,
    PRINCIPAL_RETURN,
    groupTransactionTypesToAllowedTransactions,
} from '../constants';

export const reducer: RealWorldAssetsTransactionsOperations = {
    createPrincipalDrawGroupTransactionOperation(state, action, dispatch) {
        const id = action.input.id;

        if (!id) {
            throw new Error('Group transaction must have an id');
        }

        const type = PRINCIPAL_DRAW;

        validateHasCorrectTransactions(type, action.input);

        const cashTransaction = action.input.cashTransaction ?? null;
        const feeTransactions = action.input.feeTransactions
            ? action.input.feeTransactions.map(ft => ft ?? null).filter(Boolean)
            : null;

        if (cashTransaction) {
            validateCashTransaction(state, cashTransaction);

            if (cashTransaction.amount < 0) {
                throw new Error(
                    'Principal draw cash transaction amount must be positive',
                );
            }
        }

        if (feeTransactions) {
            validateFeeTransactions(state, feeTransactions);
        }

        const newGroupTransaction = {
            id,
            type,
            cashTransaction,
            feeTransactions,
        };

        state.transactions.push(newGroupTransaction);
    },
    createPrincipalReturnGroupTransactionOperation(state, action, dispatch) {
        const id = action.input.id;

        if (!id) {
            throw new Error('Group transaction must have an id');
        }

        const type = PRINCIPAL_RETURN;

        validateHasCorrectTransactions(type, action.input);

        const cashTransaction = action.input.cashTransaction ?? null;
        const feeTransactions = action.input.feeTransactions
            ? action.input.feeTransactions.map(ft => ft ?? null).filter(Boolean)
            : null;

        if (cashTransaction) {
            validateCashTransaction(state, cashTransaction);
            if (cashTransaction.amount > 0) {
                throw new Error(
                    'Principal return cash transaction amount must be negative',
                );
            }
        }

        if (feeTransactions) {
            validateFeeTransactions(state, feeTransactions);
        }

        const newGroupTransaction = {
            id,
            type,
            cashTransaction,
            feeTransactions,
        };

        state.transactions.push(newGroupTransaction);
    },
    createAssetPurchaseGroupTransactionOperation(state, action, dispatch) {
        const id = action.input.id;

        if (!id) {
            throw new Error('Group transaction must have an id');
        }

        const type = ASSET_PURCHASE;

        validateHasCorrectTransactions(type, action.input);

        const fixedIncomeTransaction =
            action.input.fixedIncomeTransaction ?? null;
        const cashTransaction = action.input.cashTransaction ?? null;
        const feeTransactions = action.input.feeTransactions
            ? action.input.feeTransactions.map(ft => ft ?? null).filter(Boolean)
            : null;

        if (fixedIncomeTransaction) {
            validateFixedIncomeTransaction(state, fixedIncomeTransaction);
        }

        if (cashTransaction) {
            validateCashTransaction(state, cashTransaction);
        }

        if (feeTransactions) {
            validateFeeTransactions(state, feeTransactions);
        }

        const newGroupTransaction = {
            id,
            type,
            fixedIncomeTransaction,
            cashTransaction,
            feeTransactions,
        };

        state.transactions.push(newGroupTransaction);

        const assetId = fixedIncomeTransaction?.assetId;

        if (!assetId) return;

        const newAsset = makeFixedIncomeAssetWithDerivedFields(state, assetId);

        state.portfolio = state.portfolio.map(a =>
            a.id === assetId ? newAsset : a,
        );
    },
    createAssetSaleGroupTransactionOperation(state, action, dispatch) {
        const id = action.input.id;

        if (!id) {
            throw new Error('Group transaction must have an id');
        }

        const type = ASSET_SALE;

        validateHasCorrectTransactions(type, action.input);

        const fixedIncomeTransaction =
            action.input.fixedIncomeTransaction ?? null;
        const cashTransaction = action.input.cashTransaction ?? null;
        const feeTransactions = action.input.feeTransactions
            ? action.input.feeTransactions.map(ft => ft ?? null).filter(Boolean)
            : null;

        if (fixedIncomeTransaction) {
            validateFixedIncomeTransaction(state, fixedIncomeTransaction);
        }

        if (cashTransaction) {
            validateCashTransaction(state, cashTransaction);
        }

        if (feeTransactions) {
            validateFeeTransactions(state, feeTransactions);
        }

        const newGroupTransaction = {
            id,
            type,
            fixedIncomeTransaction,
            cashTransaction,
            feeTransactions,
        };

        state.transactions.push(newGroupTransaction);

        const assetId = fixedIncomeTransaction?.assetId;

        if (!assetId) return;

        const newAsset = makeFixedIncomeAssetWithDerivedFields(state, assetId);

        state.portfolio = state.portfolio.map(a =>
            a.id === assetId ? newAsset : a,
        );
    },
    createInterestDrawGroupTransactionOperation(state, action, dispatch) {
        const id = action.input.id;

        if (!id) {
            throw new Error('Group transaction must have an id');
        }

        const type = INTEREST_DRAW;

        validateHasCorrectTransactions(type, action.input);

        const interestTransaction = action.input.interestTransaction ?? null;

        if (interestTransaction) {
            validateInterestTransaction(state, interestTransaction);
        }

        const newGroupTransaction = {
            id,
            type,
            interestTransaction,
        };

        state.transactions.push(newGroupTransaction);
    },
    createInterestReturnGroupTransactionOperation(state, action, dispatch) {
        const id = action.input.id;
        if (!id) {
            throw new Error('Group transaction must have an id');
        }

        const type = INTEREST_RETURN;

        validateHasCorrectTransactions(type, action.input);

        const interestTransaction = action.input.interestTransaction ?? null;

        if (interestTransaction) {
            validateInterestTransaction(state, interestTransaction);
        }

        const newGroupTransaction = {
            id,
            type,
            interestTransaction,
        };

        state.transactions.push(newGroupTransaction);
    },
    createFeesPaymentGroupTransactionOperation(state, action, dispatch) {
        const id = action.input.id;

        if (!id) {
            throw new Error('Group transaction must have an id');
        }

        const type = FEES_PAYMENT;

        validateHasCorrectTransactions(type, action.input);

        const feeTransactions = action.input.feeTransactions
            ? action.input.feeTransactions.map(ft => ft ?? null).filter(Boolean)
            : null;

        if (feeTransactions) {
            validateFeeTransactions(state, feeTransactions);
        }

        const newGroupTransaction = {
            id,
            type,
            feeTransactions,
        };

        state.transactions.push(newGroupTransaction);
    },
    editGroupTransactionTypeOperation(state, action, dispatch) {
        const id = action.input.id;

        if (!id) {
            throw new Error('Group transaction must have an id');
        }

        const transaction = state.transactions.find(
            transaction => transaction.id === action.input.id,
        );
        if (!transaction) {
            throw new Error(
                `Group transaction with id ${action.input.id} does not exist!`,
            );
        }

        if (action.input.type === transaction.type) {
            return;
        }

        const newGroupTransaction = makeEmptyGroupTransactionByType(
            action.input.type,
            action.input.id,
        );

        state.transactions = state.transactions.map(t =>
            t.id === action.input.id ? newGroupTransaction : t,
        );
    },
    editPrincipalDrawGroupTransactionOperation(state, action, dispatch) {
        const id = action.input.id;

        if (!id) {
            throw new Error('Group transaction must have an id');
        }

        const type = PRINCIPAL_DRAW;

        validateHasCorrectTransactions(type, action.input);

        const cashTransaction = action.input.cashTransaction ?? null;
        const feeTransactions = action.input.feeTransactions
            ? action.input.feeTransactions.map(ft => ft ?? null).filter(Boolean)
            : null;

        if (cashTransaction) {
            validateCashTransaction(state, cashTransaction);
            if (cashTransaction.amount < 0) {
                throw new Error(
                    'Principal draw cash transaction amount must be positive',
                );
            }
        }

        if (feeTransactions) {
            validateFeeTransactions(state, feeTransactions);
        }

        const newGroupTransaction = {
            id,
            type,
            cashTransaction,
            feeTransactions,
        };
        state.transactions = state.transactions.map(t =>
            t.id === action.input.id ? newGroupTransaction : t,
        );
    },
    editPrincipalReturnGroupTransactionOperation(state, action, dispatch) {
        const id = action.input.id;

        if (!id) {
            throw new Error('Group transaction must have an id');
        }

        const type = PRINCIPAL_RETURN;

        validateHasCorrectTransactions(type, action.input);

        const cashTransaction = action.input.cashTransaction ?? null;
        const feeTransactions = action.input.feeTransactions
            ? action.input.feeTransactions.map(ft => ft ?? null).filter(Boolean)
            : null;

        if (cashTransaction) {
            validateCashTransaction(state, cashTransaction);
            if (cashTransaction.amount > 0) {
                throw new Error(
                    'Principal return cash transaction amount must be negative',
                );
            }
        }

        if (feeTransactions) {
            validateFeeTransactions(state, feeTransactions);
        }

        const newGroupTransaction = {
            id,
            type,
            cashTransaction,
            feeTransactions,
        };

        state.transactions = state.transactions.map(t =>
            t.id === action.input.id ? newGroupTransaction : t,
        );
    },
    editAssetPurchaseGroupTransactionOperation(state, action, dispatch) {
        const id = action.input.id;

        if (!id) {
            throw new Error('Group transaction must have an id');
        }

        const type = ASSET_PURCHASE;

        validateHasCorrectTransactions(type, action.input);

        const cashTransaction = action.input.cashTransaction ?? null;
        const fixedIncomeTransaction =
            action.input.fixedIncomeTransaction ?? null;
        const feeTransactions = action.input.feeTransactions
            ? action.input.feeTransactions.map(ft => ft ?? null).filter(Boolean)
            : null;

        if (cashTransaction) {
            validateCashTransaction(state, cashTransaction);
        }

        if (fixedIncomeTransaction) {
            validateFixedIncomeTransaction(state, fixedIncomeTransaction);
        }

        if (feeTransactions) {
            validateFeeTransactions(state, feeTransactions);
        }

        const newGroupTransaction = {
            id,
            type,
            fixedIncomeTransaction,
            cashTransaction,
            feeTransactions,
        };

        state.transactions = state.transactions.map(t =>
            t.id === action.input.id ? newGroupTransaction : t,
        );

        const assetId = fixedIncomeTransaction?.assetId;

        if (!assetId) return;

        const newAsset = makeFixedIncomeAssetWithDerivedFields(state, assetId);

        state.portfolio = state.portfolio.map(a =>
            a.id === assetId ? newAsset : a,
        );
    },
    editAssetSaleGroupTransactionOperation(state, action, dispatch) {
        const id = action.input.id;

        if (!id) {
            throw new Error('Group transaction must have an id');
        }

        const type = ASSET_SALE;

        validateHasCorrectTransactions(type, action.input);

        const fixedIncomeTransaction =
            action.input.fixedIncomeTransaction ?? null;
        const cashTransaction = action.input.cashTransaction ?? null;
        const feeTransactions = action.input.feeTransactions
            ? action.input.feeTransactions.map(ft => ft ?? null).filter(Boolean)
            : null;

        if (fixedIncomeTransaction) {
            validateFixedIncomeTransaction(state, fixedIncomeTransaction);
        }

        if (cashTransaction) {
            validateCashTransaction(state, cashTransaction);
        }

        if (feeTransactions) {
            validateFeeTransactions(state, feeTransactions);
        }

        const newGroupTransaction = {
            id,
            type,
            fixedIncomeTransaction,
            cashTransaction,
            feeTransactions,
        };

        state.transactions = state.transactions.map(t =>
            t.id === action.input.id ? newGroupTransaction : t,
        );

        const assetId = fixedIncomeTransaction?.assetId;

        if (!assetId) return;

        const newAsset = makeFixedIncomeAssetWithDerivedFields(state, assetId);

        state.portfolio = state.portfolio.map(a =>
            a.id === assetId ? newAsset : a,
        );
    },
    editInterestDrawGroupTransactionOperation(state, action, dispatch) {
        const id = action.input.id;

        if (!id) {
            throw new Error('Group transaction must have an id');
        }

        const type = INTEREST_DRAW;

        validateHasCorrectTransactions(type, action.input);

        const interestTransaction = action.input.interestTransaction ?? null;

        if (interestTransaction) {
            validateInterestTransaction(state, interestTransaction);
        }

        const newGroupTransaction = {
            id,
            type,
            interestTransaction,
        };

        state.transactions = state.transactions.map(t =>
            t.id === action.input.id ? newGroupTransaction : t,
        );
    },
    editInterestReturnGroupTransactionOperation(state, action, dispatch) {
        const id = action.input.id;

        if (!id) {
            throw new Error('Group transaction must have an id');
        }

        const type = INTEREST_RETURN;

        validateHasCorrectTransactions(type, action.input);

        const interestTransaction = action.input.interestTransaction ?? null;

        if (interestTransaction) {
            validateInterestTransaction(state, interestTransaction);
        }

        const newGroupTransaction = {
            id,
            type,
            interestTransaction,
        };

        state.transactions = state.transactions.map(t =>
            t.id === action.input.id ? newGroupTransaction : t,
        );
    },
    addFeeTransactionsToGroupTransactionOperation(state, action) {
        const id = action.input.id;

        if (!id) {
            throw new Error('Group transaction must have an id');
        }

        const transaction = state.transactions.find(
            transaction => transaction.id === id,
        );

        if (!transaction) {
            throw new Error(`Group transaction with id ${id} does not exist!`);
        }

        if (
            !groupTransactionTypesToAllowedTransactions[
                transaction.type
            ].includes(FEE_TRANSACTIONS) ||
            !('feeTransactions' in transaction)
        ) {
            throw new Error(
                `Group transaction of type ${transaction.type} cannot have fee transactions`,
            );
        }

        const feeTransactions = action.input.feeTransactions
            ? action.input.feeTransactions.map(ft => ft ?? null).filter(Boolean)
            : null;

        if (!feeTransactions) return;

        validateFeeTransactions(state, feeTransactions);

        const newFeeTransactions = [
            ...feeTransactions,
            ...(transaction.feeTransactions || []),
        ];

        const newGroupTransaction = {
            ...transaction,
            feeTransactions: newFeeTransactions,
        };

        state.transactions = state.transactions.map(t =>
            t.id === action.input.id ? newGroupTransaction : t,
        );
    },
    editFeeTransactionOperation(state, action, dispatch) {
        const id = action.input.id;
        const feeTransactionId = action.input.feeTransactionId;

        if (!id) {
            throw new Error('Group transaction must have an id');
        }

        if (!feeTransactionId) {
            throw new Error('Fee transaction must have an id');
        }

        const groupTransaction = state.transactions.find(
            transaction => transaction.id === id,
        );

        if (!groupTransaction) {
            throw new Error(`Group transaction with id ${id} does not exist!`);
        }

        if (
            !groupTransactionTypesToAllowedTransactions[
                groupTransaction.type
            ].includes(FEE_TRANSACTIONS) ||
            !('feeTransactions' in groupTransaction)
        ) {
            throw new Error(
                `Group transaction of type ${groupTransaction.type} cannot have fee transactions`,
            );
        }

        if (!groupTransaction.feeTransactions) {
            throw new Error(
                `Group transaction with id ${id} does not have fee transactions`,
            );
        }

        const feeTransaction = groupTransaction.feeTransactions.find(
            f => f?.id === feeTransactionId,
        );

        if (!feeTransaction) {
            throw new Error(
                `Fee transaction with id ${feeTransactionId} does not exist!`,
            );
        }

        const newFeeTransaction = {
            ...feeTransaction,
            ...action.input,
        };

        validateFeeTransaction(state, newFeeTransaction);

        const newFeeTransactions = groupTransaction.feeTransactions.map(f =>
            f?.id === feeTransactionId ? newFeeTransaction : f,
        );

        const newGroupTransaction = {
            ...groupTransaction,
            feeTransactions: newFeeTransactions,
        };

        state.transactions = state.transactions.map(t =>
            t.id === action.input.id ? newGroupTransaction : t,
        );
    },
    removeFeeTransactionFromGroupTransactionOperation(state, action) {
        const { id, feeTransactionId } = action.input;

        if (!id) {
            throw new Error('Group transaction must have an id');
        }

        if (!feeTransactionId) {
            throw new Error('Fee transaction must have an id');
        }

        const groupTransaction = state.transactions.find(
            transaction => transaction.id === id,
        );

        if (!groupTransaction) {
            throw new Error(`Group transaction with id ${id} does not exist!`);
        }

        if (
            !groupTransactionTypesToAllowedTransactions[
                groupTransaction.type
            ].includes(FEE_TRANSACTIONS) ||
            !('feeTransactions' in groupTransaction)
        ) {
            throw new Error(
                `Group transaction of type ${groupTransaction.type} cannot have fee transactions`,
            );
        }

        if (!groupTransaction.feeTransactions) {
            throw new Error(
                `Group transaction with id ${id} does not have fee transactions`,
            );
        }

        const feeTransaction = groupTransaction.feeTransactions.find(
            f => f?.id === feeTransactionId,
        );

        if (!feeTransaction) {
            throw new Error(
                `Fee transaction with id ${feeTransactionId} does not exist!`,
            );
        }

        const newFeeTransactions = groupTransaction.feeTransactions.filter(
            f => f?.id !== feeTransactionId,
        );

        const newGroupTransaction = {
            ...groupTransaction,
            feeTransactions: newFeeTransactions,
        };

        state.transactions = state.transactions.map(t =>
            t.id === id ? newGroupTransaction : t,
        );
    },
    deleteGroupTransactionOperation(state, action, dispatch) {
        if (!action.input.id) {
            throw new Error('Group transaction must have an id');
        }

        state.transactions = state.transactions.filter(
            transaction => transaction.id !== action.input.id,
        );
    },
};
