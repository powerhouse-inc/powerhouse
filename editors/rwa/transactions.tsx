import {
    CashAsset,
    GroupTransactionFormInputs,
    GroupTransactionsTable,
    GroupTransactionsTableProps,
    FixedIncome as UiFixedIncome,
    GroupTransaction as UiGroupTransaction,
    assetGroupTransactions,
} from '@powerhousedao/design-system';
import { copy } from 'copy-anything';
import { utils } from 'document-model/document';
import diff from 'microdiff';
import { useCallback, useState } from 'react';
import {
    BaseTransaction,
    EditBaseTransactionInput,
    FixedIncome,
    GroupTransaction,
    TransactionFeeInput,
    getDifferences,
    isCashAsset,
    isFixedIncomeAsset,
} from '../../document-models/real-world-assets';
import {
    addFeesToGroupTransaction,
    createGroupTransaction,
    deleteGroupTransaction,
    editGroupTransaction,
    editGroupTransactionFees,
    removeFeesFromGroupTransaction,
} from '../../document-models/real-world-assets/gen/creators';
import { IProps } from './editor';

export const Transactions = (props: IProps) => {
    const { dispatch, document } = props;

    const transactions = document.state.global.transactions;

    const fixedIncomeAssets = document.state.global.portfolio.filter(
        (asset): asset is FixedIncome => isFixedIncomeAsset(asset),
    );

    // there is only one cash asset for v1
    // this is always defined for every document model
    const cashAsset = document.state.global.portfolio.find(
        isCashAsset,
    ) as CashAsset;

    const principalLenderAccountId =
        document.state.global.principalLenderAccountId;

    const serviceProviderFeeTypes =
        document.state.global.serviceProviderFeeTypes;

    const accounts = document.state.global.accounts;

    const [expandedRowId, setExpandedRowId] = useState<string>();
    const [selectedItem, setSelectedItem] = useState<UiGroupTransaction>();
    const [showNewItemForm, setShowNewItemForm] = useState(false);

    const createNewGroupTransactionFromFormInputs = useCallback(
        (data: GroupTransactionFormInputs) => {
            const {
                cashAmount,
                fixedIncomeId,
                fixedIncomeAmount,
                type,
                cashBalanceChange,
                unitPrice,
            } = data;
            if (!type) throw new Error('Type is required');
            if (!data.entryTime) throw new Error('Entry time is required');
            if (!cashBalanceChange) {
                throw new Error('Cash balance change is required');
            }
            if (!unitPrice && assetGroupTransactions.includes(type)) {
                throw new Error(
                    'Unit price is required for asset transactions',
                );
            }

            const entryTime = new Date(data.entryTime).toISOString();

            const fees = data.fees?.length
                ? data.fees.map(fee => ({
                      ...fee,
                      id: utils.hashKey(),
                  }))
                : null;

            const cashTransaction = cashAmount
                ? {
                      id: utils.hashKey(),
                      assetId: cashAsset.id,
                      entryTime,
                      counterPartyAccountId: principalLenderAccountId,
                      amount: cashAmount,
                      accountId: null,
                      settlementTime: null,
                      tradeTime: null,
                      txRef: null,
                  }
                : null;

            if (fixedIncomeId && !fixedIncomeAmount) {
                throw new Error('Fixed income  amount is required');
            }
            if (fixedIncomeAmount && !fixedIncomeId) {
                throw new Error('Fixed income  ID is required');
            }
            const fixedIncomeTransaction =
                fixedIncomeId && fixedIncomeAmount
                    ? {
                          id: utils.hashKey(),
                          assetId: fixedIncomeId,
                          amount: fixedIncomeAmount,
                          entryTime,
                          accountId: null,
                          counterPartyAccountId: null,
                          settlementTime: null,
                          tradeTime: null,
                          txRef: null,
                      }
                    : null;

            const groupTransaction = {
                id: utils.hashKey(),
                type,
                cashTransaction,
                cashBalanceChange,
                unitPrice,
                entryTime,
                fees,
                fixedIncomeTransaction,
                interestTransaction: null,
                feeTransactions: null,
            };
            return groupTransaction;
        },
        [principalLenderAccountId, cashAsset.id],
    );

    const toggleExpandedRow = useCallback(
        (id: string | undefined) => {
            setExpandedRowId(curr =>
                curr && curr === expandedRowId ? undefined : id,
            );
        },
        [expandedRowId],
    );

    const handleFeeUpdates = useCallback(
        (
            feeInputs: TransactionFeeInput[] | null | undefined,
            transaction: GroupTransaction,
        ) => {
            if (!feeInputs) return;

            const feeUpdates = feeInputs.map(fee => ({
                ...fee,
                id: fee.id ?? utils.hashKey(),
                amount: Number(fee.amount),
            }));

            const existingFees = transaction.fees;

            if (!existingFees?.length) {
                dispatch(
                    addFeesToGroupTransaction({
                        id: transaction.id,
                        fees: feeUpdates,
                    }),
                );
                return;
            }
            const feeDifferences = diff(existingFees, feeInputs);

            const newFeesToCreate: TransactionFeeInput[] = [];
            const feesToUpdate: TransactionFeeInput[] = [];
            const feeIdsToRemove: string[] = [];

            feeDifferences.forEach(difference => {
                if (
                    difference.type === 'CREATE' &&
                    !existingFees.find(
                        fee =>
                            fee.id ===
                            feeUpdates[difference.path[0] as number].id,
                    )
                ) {
                    newFeesToCreate.push(
                        feeUpdates[difference.path[0] as number],
                    );
                }
                if (difference.type === 'REMOVE') {
                    feeIdsToRemove.push(
                        existingFees[difference.path[0] as number].id,
                    );
                }
                if (difference.type === 'CHANGE') {
                    feesToUpdate.push(feeUpdates[difference.path[0] as number]);
                }
            });

            if (newFeesToCreate.length) {
                dispatch(
                    addFeesToGroupTransaction({
                        id: transaction.id,
                        fees: newFeesToCreate,
                    }),
                );
            }
            if (feesToUpdate.length) {
                dispatch(
                    editGroupTransactionFees({
                        id: transaction.id,
                        fees: feesToUpdate,
                    }),
                );
            }
            if (feeIdsToRemove.length) {
                dispatch(
                    removeFeesFromGroupTransaction({
                        id: transaction.id,
                        feeIds: feeIdsToRemove,
                    }),
                );
            }
        },
        [dispatch],
    );

    const onSubmitEdit: GroupTransactionsTableProps['onSubmitEdit'] =
        useCallback(
            data => {
                if (!selectedItem) return;
                const newEntryTime = data.entryTime
                    ? new Date(data.entryTime).toISOString()
                    : undefined;
                const newType = data.type;
                const newFixedIncomeAssetId = data.fixedIncomeId;
                const newFixedIncomeAssetAmount = data.fixedIncomeAmount;
                const newCashAmount = data.cashAmount;
                const newCashBalanceChange = data.cashBalanceChange;

                const existingCashTransaction = selectedItem.cashTransaction;

                const existingFixedIncomeTransaction =
                    selectedItem.fixedIncomeTransaction;

                const update = copy(selectedItem);

                if (newType) {
                    update.type = newType;
                }

                if (newEntryTime) {
                    update.entryTime = newEntryTime;
                }

                // use type comparison to avoid false positives on zero
                if (typeof newCashAmount === 'number') {
                    if (!update.cashTransaction) {
                        throw new Error('Cash transaction does not exist');
                    }
                    update.cashTransaction.amount = newCashAmount;
                }

                if (newFixedIncomeAssetId) {
                    if (!update.fixedIncomeTransaction) {
                        throw new Error(
                            'Fixed income transaction does not exist',
                        );
                    }
                    update.fixedIncomeTransaction.assetId =
                        newFixedIncomeAssetId;
                }

                // use direct comparison to avoid false positives on zero
                if (typeof newFixedIncomeAssetAmount === 'number') {
                    if (!update.fixedIncomeTransaction) {
                        throw new Error(
                            'Fixed income transaction does not exist',
                        );
                    }
                    update.fixedIncomeTransaction.amount =
                        newFixedIncomeAssetAmount;
                }

                if (newCashBalanceChange) {
                    update.cashBalanceChange = newCashBalanceChange;
                }

                let changedFields = getDifferences(selectedItem, update);

                if ('fixedIncomeTransaction' in changedFields) {
                    if (!existingFixedIncomeTransaction) {
                        throw new Error(
                            'Fixed income transaction does not exist',
                        );
                    }
                    const fixedIncomeTransactionChangedFields = getDifferences(
                        existingFixedIncomeTransaction,
                        update.fixedIncomeTransaction,
                    ) as BaseTransaction;

                    changedFields = {
                        ...changedFields,
                        fixedIncomeTransaction: {
                            ...fixedIncomeTransactionChangedFields,
                            id: existingFixedIncomeTransaction.id,
                        },
                    };
                }

                if ('cashTransaction' in changedFields) {
                    if (!existingCashTransaction) {
                        throw new Error('Cash transaction does not exist');
                    }
                    const cashTransactionChangedFields = getDifferences(
                        existingCashTransaction,
                        update.cashTransaction,
                    ) as BaseTransaction;

                    changedFields = {
                        ...changedFields,
                        cashTransaction: {
                            ...cashTransactionChangedFields,
                            id: existingCashTransaction.id,
                        },
                    };
                }

                if (data.fees) {
                    handleFeeUpdates(data.fees, update as GroupTransaction);
                }

                if (Object.keys(changedFields).length !== 0) {
                    dispatch(
                        editGroupTransaction({
                            ...changedFields,
                            id: selectedItem.id,
                        } as EditBaseTransactionInput),
                    );
                }

                setSelectedItem(undefined);
            },
            [dispatch, selectedItem, handleFeeUpdates],
        );

    const onSubmitCreate: GroupTransactionsTableProps['onSubmitCreate'] =
        useCallback(
            data => {
                const transaction =
                    createNewGroupTransactionFromFormInputs(data);

                dispatch(createGroupTransaction(transaction));
                setShowNewItemForm(false);
            },
            [createNewGroupTransactionFromFormInputs, dispatch],
        );

    const onSubmitDelete: GroupTransactionsTableProps['onSubmitDelete'] =
        useCallback(
            (id: string) => {
                dispatch(deleteGroupTransaction({ id }));
            },
            [dispatch],
        );

    return (
        <div>
            <h1 className="text-lg font-bold mb-2">Transactions</h1>
            <p className="text-xs text-gray-600 mb-4">
                Details of this portfolios transactions
            </p>
            <GroupTransactionsTable
                fixedIncomes={fixedIncomeAssets as UiFixedIncome[]}
                cashAsset={cashAsset}
                transactions={transactions}
                accounts={accounts}
                serviceProviderFeeTypes={serviceProviderFeeTypes}
                expandedRowId={expandedRowId}
                toggleExpandedRow={toggleExpandedRow}
                selectedItem={selectedItem}
                principalLenderAccountId={principalLenderAccountId}
                setSelectedItem={setSelectedItem}
                onSubmitEdit={onSubmitEdit}
                onSubmitCreate={onSubmitCreate}
                showNewItemForm={showNewItemForm}
                setShowNewItemForm={setShowNewItemForm}
                onSubmitDelete={onSubmitDelete}
            />
        </div>
    );
};
