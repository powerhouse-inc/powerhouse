/**
 * This is a scaffold file meant for customization:
 * - modify it by implementing the reducer functions
 * - delete the file and run the code generator again to have it reset
 */

import { copy } from 'copy-anything';
import {
    Cash,
    calculateCashBalanceChange,
    calculateTotalFees,
    calculateUnitPrice,
    isCashAsset,
    makeFixedIncomeAssetWithDerivedFields,
    math,
    validateGroupTransaction,
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
        const fees = action.input.fees ?? null;
        const serviceProviderFeeTypeId =
            action.input.serviceProviderFeeTypeId ?? null;
        const txRef = action.input.txRef ?? null;
        let cashTransaction = action.input.cashTransaction;
        let fixedIncomeTransaction =
            action.input.fixedIncomeTransaction ?? null;
        const cashBalanceChange = calculateCashBalanceChange(
            type,
            cashTransaction.amount,
            fees,
        ).toNumber();
        const unitPrice = fixedIncomeTransaction
            ? calculateUnitPrice(
                  cashTransaction.amount,
                  fixedIncomeTransaction.amount,
              ).toNumber()
            : null;

        cashTransaction = {
            ...cashTransaction,
            entryTime,
        };

        if (fixedIncomeTransaction) {
            fixedIncomeTransaction = {
                ...fixedIncomeTransaction,
                entryTime,
            };
        }

        const newGroupTransaction = {
            id,
            type,
            entryTime,
            cashBalanceChange,
            unitPrice,
            serviceProviderFeeTypeId,
            txRef,
            fees,
            cashTransaction,
            fixedIncomeTransaction,
        };

        validateGroupTransaction(state, newGroupTransaction);

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

        const oldTransaction = state.transactions.find(
            transaction => transaction.id === action.input.id,
        );

        if (!oldTransaction) {
            throw new Error(
                `Group transaction with id ${action.input.id} does not exist!`,
            );
        }

        // make a copy so that we can retain the old transaction values for updating related assets
        const newTransaction = copy(oldTransaction);

        const {
            type,
            entryTime,
            serviceProviderFeeTypeId,
            txRef,
            cashTransaction,
            fixedIncomeTransaction,
        } = action.input;

        if (type) {
            newTransaction.type = type;
        }

        if (entryTime) {
            newTransaction.entryTime = entryTime;
            newTransaction.cashTransaction.entryTime = entryTime;
        }

        if (serviceProviderFeeTypeId) {
            newTransaction.serviceProviderFeeTypeId = serviceProviderFeeTypeId;
        }

        if (txRef) {
            newTransaction.txRef = txRef;
        }

        if (cashTransaction?.amount) {
            newTransaction.cashTransaction.amount = cashTransaction.amount;
        }

        if (cashTransaction?.amount || type) {
            newTransaction.cashBalanceChange = calculateCashBalanceChange(
                newTransaction.type,
                newTransaction.cashTransaction.amount,
                newTransaction.fees,
            ).toNumber();
        }

        if (newTransaction.fixedIncomeTransaction) {
            if (fixedIncomeTransaction?.amount) {
                newTransaction.fixedIncomeTransaction.amount =
                    fixedIncomeTransaction.amount;
            }

            if (fixedIncomeTransaction?.assetId) {
                newTransaction.fixedIncomeTransaction.assetId =
                    fixedIncomeTransaction.assetId;
            }

            newTransaction.fixedIncomeTransaction.entryTime =
                newTransaction.entryTime;
        }

        // first validate and update the transaction
        validateGroupTransaction(state, newTransaction);

        state.transactions = state.transactions.map(t =>
            t.id === newTransaction.id ? newTransaction : t,
        );

        // if successfully updated transaction, also update related assets

        // if cash amount has changed, update the cash asset in state
        if (cashTransaction?.amount || type) {
            const cashAsset = state.portfolio.find(a => isCashAsset(a)) as Cash;
            cashAsset.balance +=
                newTransaction.cashBalanceChange -
                oldTransaction.cashBalanceChange;

            state.portfolio = state.portfolio.map(a =>
                a.id === cashAsset.id ? cashAsset : a,
            );
        }

        // if the existing transaction had a fixed income asset, update that asset to reflect the changes
        if (oldTransaction.fixedIncomeTransaction?.assetId) {
            const updatedOldFixedIncomeAsset =
                makeFixedIncomeAssetWithDerivedFields(
                    state,
                    oldTransaction.fixedIncomeTransaction.assetId,
                );

            state.portfolio = state.portfolio.map(a =>
                a.id === updatedOldFixedIncomeAsset.id
                    ? updatedOldFixedIncomeAsset
                    : a,
            );
        }

        // if the new transaction has a fixed income asset, update that asset to have the effects of the transaction
        if (fixedIncomeTransaction?.assetId) {
            const updatedNewFixedIncomeAsset =
                makeFixedIncomeAssetWithDerivedFields(
                    state,
                    fixedIncomeTransaction.assetId,
                );

            state.portfolio = state.portfolio.map(a =>
                a.id === updatedNewFixedIncomeAsset.id
                    ? updatedNewFixedIncomeAsset
                    : a,
            );
        }
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

        const cashAsset = state.portfolio.find(a => isCashAsset(a)) as Cash;

        const updatedCashAsset = {
            ...cashAsset,
            balance: cashAsset.balance - transactionToRemove.cashBalanceChange,
        };

        state.portfolio = state.portfolio.map(a =>
            a.id === cashAsset.id ? updatedCashAsset : a,
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

        const oldFees = copy(transaction.fees ?? []);
        const oldTotalFees = calculateTotalFees(oldFees);

        if (!transaction.fees) {
            transaction.fees = [];
        }

        transaction.fees.push(...action.input.fees);

        const newTotalFees = calculateTotalFees(transaction.fees);

        transaction.cashBalanceChange = calculateCashBalanceChange(
            transaction.type,
            transaction.cashTransaction.amount,
            transaction.fees,
        ).toNumber();

        state.transactions = state.transactions.map(t =>
            t.id === action.input.id ? transaction : t,
        );

        const cashAsset = state.portfolio.find(a => isCashAsset(a)) as Cash;

        const updatedCashAsset = {
            ...cashAsset,
            balance: math
                .bignumber(cashAsset.balance)
                .add(oldTotalFees.sub(newTotalFees))
                .toNumber(),
        };

        state.portfolio = state.portfolio.map(a =>
            a.id === cashAsset.id ? updatedCashAsset : a,
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

        const oldTotalFees = calculateTotalFees(transaction.fees);

        transaction.fees = transaction.fees.filter(
            fee => !feeIdsToRemove?.includes(fee.id),
        );

        transaction.cashBalanceChange = calculateCashBalanceChange(
            transaction.type,
            transaction.cashTransaction.amount,
            transaction.fees,
        ).toNumber();

        state.transactions = state.transactions.map(t =>
            t.id === id ? transaction : t,
        );

        const cashAsset = state.portfolio.find(a => isCashAsset(a)) as Cash;

        const updatedCashAsset = {
            ...cashAsset,
            balance: math
                .bignumber(cashAsset.balance)
                .add(oldTotalFees)
                .toNumber(),
        };

        state.portfolio = state.portfolio.map(a =>
            a.id === cashAsset.id ? updatedCashAsset : a,
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

        const oldTotalFees = calculateTotalFees(transaction.fees);

        transaction.fees = transaction.fees
            .map(fee => {
                const feeToUpdate = fees.find(f => f.id === fee.id);
                if (!feeToUpdate) return;
                validateTransactionFee(state, feeToUpdate);
                return { ...fee, ...feeToUpdate };
            })
            .filter(Boolean);

        const newTotalFees = calculateTotalFees(transaction.fees);

        transaction.cashBalanceChange = calculateCashBalanceChange(
            transaction.type,
            transaction.cashTransaction.amount,
            transaction.fees,
        ).toNumber();

        state.transactions = state.transactions.map(t =>
            t.id === id ? transaction : t,
        );

        const cashAsset = state.portfolio.find(a => isCashAsset(a)) as Cash;

        const updatedCashAsset = {
            ...cashAsset,
            balance: math
                .bignumber(cashAsset.balance)
                .add(oldTotalFees.sub(newTotalFees))
                .toNumber(),
        };

        state.portfolio = state.portfolio.map(a =>
            a.id === cashAsset.id ? updatedCashAsset : a,
        );
    },
};
