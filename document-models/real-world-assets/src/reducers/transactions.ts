/**
 * This is a scaffold file meant for customization:
 * - modify it by implementing the reducer functions
 * - delete the file and run the code generator again to have it reset
 */

import {
    Cash,
    isCashAsset,
    makeFixedIncomeAssetWithDerivedFields,
    validateCashTransaction,
    validateFixedIncomeTransaction,
    validateTransactionFee,
    validateTransactionFees,
} from '../..';
import { RealWorldAssetsTransactionsOperations } from '../../gen/transactions/operations';
export const reducer: RealWorldAssetsTransactionsOperations = {
    createGroupTransactionOperation(state, action, dispatch) {
        const id = action.input.id;

        if (!id) {
            throw new Error('Group transaction must have an id');
        }

        const type = action.input.type;
        const entryTime = action.input.entryTime;
        const cashBalanceChange = action.input.cashBalanceChange;
        const unitPrice = action.input.unitPrice ?? null;
        const fees = action.input.fees ?? null;
        let cashTransaction = action.input.cashTransaction ?? null;
        let fixedIncomeTransaction =
            action.input.fixedIncomeTransaction ?? null;

        if (cashTransaction) {
            cashTransaction = {
                ...cashTransaction,
                entryTime,
            };
            validateCashTransaction(state, cashTransaction);
        }

        if (fixedIncomeTransaction) {
            fixedIncomeTransaction = {
                ...fixedIncomeTransaction,
                entryTime,
            };
            validateFixedIncomeTransaction(state, fixedIncomeTransaction);
        }

        if (fees) {
            validateTransactionFees(state, fees);
        }

        const newGroupTransaction = {
            id,
            type,
            entryTime,
            cashBalanceChange,
            unitPrice,
            fees,
            cashTransaction,
            fixedIncomeTransaction,
        };

        state.transactions.push(newGroupTransaction);

        const cashAsset = state.portfolio.find(a => isCashAsset(a)) as Cash;

        const updatedCashAsset = {
            ...cashAsset,
            balance: cashAsset.balance + cashBalanceChange,
        };

        state.portfolio = state.portfolio.map(a =>
            a.id === cashAsset.id ? updatedCashAsset : a,
        );

        const fixedIncomeAssetId = fixedIncomeTransaction?.assetId;

        if (!fixedIncomeAssetId) return;

        const updatedFixedIncomeAsset = makeFixedIncomeAssetWithDerivedFields(
            state,
            fixedIncomeAssetId,
        );

        state.portfolio = state.portfolio.map(a =>
            a.id === fixedIncomeAssetId ? updatedFixedIncomeAsset : a,
        );
    },
    editGroupTransactionOperation(state, action, dispatch) {
        const id = action.input.id;

        if (!id) {
            throw new Error('Group transaction must have an id');
        }

        const transactionIndex = state.transactions.findIndex(
            transaction => transaction.id === action.input.id,
        );

        if (transactionIndex === -1) {
            throw new Error(
                `Group transaction with id ${action.input.id} does not exist!`,
            );
        }

        const transaction = state.transactions[transactionIndex];

        if (action.input.type) {
            transaction.type = action.input.type;
        }

        if (action.input.entryTime) {
            transaction.entryTime = action.input.entryTime;
            if (transaction.cashTransaction) {
                transaction.cashTransaction.entryTime = action.input.entryTime;
            }
            if (transaction.fixedIncomeTransaction) {
                transaction.fixedIncomeTransaction.entryTime =
                    action.input.entryTime;
            }
        }

        if (
            action.input.fixedIncomeTransaction?.amount &&
            transaction.fixedIncomeTransaction
        ) {
            transaction.fixedIncomeTransaction.amount =
                action.input.fixedIncomeTransaction.amount;
        }

        if (
            action.input.fixedIncomeTransaction?.assetId &&
            transaction.fixedIncomeTransaction
        ) {
            transaction.fixedIncomeTransaction.assetId =
                action.input.fixedIncomeTransaction.assetId;
        }

        if (
            action.input.cashTransaction?.amount &&
            transaction.cashTransaction
        ) {
            transaction.cashTransaction.amount =
                action.input.cashTransaction.amount;
        }

        if (action.input.cashBalanceChange) {
            transaction.cashBalanceChange = action.input.cashBalanceChange;
        }

        if (action.input.unitPrice) {
            transaction.unitPrice = action.input.unitPrice;
        }

        state.transactions = state.transactions.map(t =>
            t.id === transaction.id ? transaction : t,
        );

        const cashAsset = state.portfolio.find(a => isCashAsset(a)) as Cash;

        const updatedCashAsset = {
            ...cashAsset,
            balance: cashAsset.balance + transaction.cashBalanceChange,
        };

        state.portfolio = state.portfolio.map(a =>
            a.id === cashAsset.id ? updatedCashAsset : a,
        );

        const fixedIncomeAssetId = transaction.fixedIncomeTransaction?.assetId;

        if (!fixedIncomeAssetId) return;

        const updatedFixedIncomeAsset = makeFixedIncomeAssetWithDerivedFields(
            state,
            fixedIncomeAssetId,
        );

        state.portfolio = state.portfolio.map(a =>
            a.id === fixedIncomeAssetId ? updatedFixedIncomeAsset : a,
        );
    },
    deleteGroupTransactionOperation(state, action, dispatch) {
        const id = action.input.id;

        if (!id) {
            throw new Error('Group transaction must have an id');
        }

        const transactionToRemove = state.transactions.find(
            transaction => transaction.id === id,
        );

        if (!transactionToRemove) {
            throw new Error('Transaction does not exist');
        }

        state.transactions = state.transactions.filter(
            transaction => transaction.id !== id,
        );

        const fixedIncomeAssetId =
            transactionToRemove.fixedIncomeTransaction?.assetId;

        if (!fixedIncomeAssetId) return;

        const updatedFixedIncomeAsset = makeFixedIncomeAssetWithDerivedFields(
            state,
            fixedIncomeAssetId,
        );

        state.portfolio = state.portfolio.map(a =>
            a.id === fixedIncomeAssetId ? updatedFixedIncomeAsset : a,
        );

        const cashAssetId = transactionToRemove.cashTransaction?.assetId;

        if (!cashAssetId) return;

        const cashAsset = state.portfolio.find(
            a => a.id === cashAssetId,
        ) as Cash;

        const updatedCashAsset = {
            ...cashAsset,
            balance: cashAsset.balance - transactionToRemove.cashBalanceChange,
        };

        state.portfolio = state.portfolio.map(a =>
            a.id === cashAssetId ? updatedCashAsset : a,
        );
    },
    addFeesToGroupTransactionOperation(state, action, dispatch) {
        const id = action.input.id;

        const transaction = state.transactions.find(
            transaction => transaction.id === id,
        );

        if (!transaction) {
            throw new Error(`Group transaction with id ${id} does not exist!`);
        }

        validateTransactionFees(state, action.input.fees);

        if (!transaction.fees) {
            transaction.fees = [];
        }

        transaction.fees.push(...action.input.fees);

        state.transactions = state.transactions.map(t =>
            t.id === action.input.id ? transaction : t,
        );
    },
    removeFeesFromGroupTransactionOperation(state, action, dispatch) {
        const id = action.input.id;
        const feeIdsToRemove = action.input.feeIds;

        const transaction = state.transactions.find(
            transaction => transaction.id === id,
        );

        if (!transaction) {
            throw new Error('Transaction does not exist');
        }

        if (!transaction.fees) {
            throw new Error('Transaction has no fees to remove');
        }

        transaction.fees = transaction.fees.filter(
            fee => !feeIdsToRemove?.includes(fee.id),
        );

        state.transactions = state.transactions.map(t =>
            t.id === id ? transaction : t,
        );
    },
    editGroupTransactionFeesOperation(state, action, dispatch) {
        const id = action.input.id;
        const fees = action.input.fees;
        if (!fees) throw new Error('Fees must be provided');

        const transaction = state.transactions.find(
            transaction => transaction.id === id,
        );

        if (!transaction) {
            throw new Error('Transaction does not exist');
        }

        validateTransactionFees(state, action.input.fees);

        if (!transaction.fees) {
            throw new Error('This transaction has no fees to update');
        }

        transaction.fees = transaction.fees
            .map(fee => {
                const feeToUpdate = fees.find(f => f.id === fee.id);
                if (!feeToUpdate) return;
                validateTransactionFee(state, feeToUpdate);
                return { ...fee, ...feeToUpdate };
            })
            .filter(Boolean);

        state.transactions = state.transactions.map(t =>
            t.id === id ? transaction : t,
        );
    },
};
