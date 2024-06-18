import {
    AssetsTableProps,
    CashAsset,
    GroupTransactionFormInputs,
    GroupTransactionsTable,
    GroupTransactionsTableProps,
} from '@powerhousedao/design-system';
import { copy } from 'copy-anything';
import { utils } from 'document-model/document';
import diff from 'microdiff';
import { useCallback } from 'react';
import {
    BaseTransaction,
    BaseTransactionInput,
    EditTransactionFeeInput,
    GroupTransaction,
    getDifferences,
    isCashAsset,
    validateTransactionFees,
} from '../../document-models/real-world-assets';
import {
    addFeesToGroupTransaction,
    createFixedIncomeAsset,
    createGroupTransaction,
    createServiceProviderFeeType,
    deleteGroupTransaction,
    editGroupTransaction,
    editGroupTransactionFees,
    removeFeesFromGroupTransaction,
} from '../../document-models/real-world-assets/gen/creators';
import { IProps } from './editor';
import { verifyTransactionFeeFields } from './utils';

export const Transactions = (props: IProps) => {
    const {
        dispatch,
        document,
        isAllowedToCreateDocuments,
        isAllowedToEditDocuments,
    } = props;

    const state = document.state.global;

    // there is only one cash asset for v1
    // this is always defined for every document model
    const cashAsset = document.state.global.portfolio.find(
        isCashAsset,
    ) as CashAsset;

    const principalLenderAccountId =
        document.state.global.principalLenderAccountId;

    const createNewGroupTransactionFromFormInputs = useCallback(
        (data: GroupTransactionFormInputs) => {
            const {
                cashAmount,
                fixedIncomeId,
                fixedIncomeAmount,
                type,
                txRef,
            } = data;
            if (!type) throw new Error('Type is required');
            if (!data.entryTime) throw new Error('Entry time is required');
            if (!cashAmount) {
                throw new Error('Cash amount is required');
            }

            const entryTime = new Date(data.entryTime).toISOString();

            const fees = data.fees?.length
                ? data.fees.map(fee => ({
                      ...fee,
                      id: utils.hashKey(),
                  }))
                : null;

            if (fees) {
                verifyTransactionFeeFields(fees);
            }

            const cashTransaction = {
                id: utils.hashKey(),
                assetType: 'Cash' as const,
                assetId: cashAsset.id,
                entryTime,
                counterPartyAccountId: principalLenderAccountId,
                amount: cashAmount,
                accountId: null,
                settlementTime: null,
                tradeTime: null,
            };

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
                          assetType: 'FixedIncome' as const,
                          assetId: fixedIncomeId,
                          amount: fixedIncomeAmount,
                          entryTime,
                          accountId: null,
                          counterPartyAccountId: null,
                          settlementTime: null,
                          tradeTime: null,
                      }
                    : null;

            const groupTransaction = {
                id: utils.hashKey(),
                type,
                entryTime,
                fees,
                txRef,
                cashTransaction,
                fixedIncomeTransaction,
                interestTransaction: null,
                feeTransactions: null,
            };
            return groupTransaction;
        },
        [principalLenderAccountId, cashAsset.id],
    );

    const handleFeeUpdates = useCallback(
        (
            feeInputs: EditTransactionFeeInput[] | null | undefined,
            transaction: GroupTransaction,
        ) => {
            const existingFees = transaction.fees;

            // if there are no existing fees and no fees to update, we do nothing
            if (!existingFees?.length && !feeInputs?.length) return;

            // if there are existing fees and the update is empty, then we remove all fees
            if (existingFees?.length && !feeInputs?.length) {
                dispatch(
                    removeFeesFromGroupTransaction({
                        id: transaction.id,
                        feeIds: existingFees.map(fee => fee.id),
                    }),
                );
                return;
            }

            // once we have handled the edge cases, we can assume that there are fees to update
            if (!feeInputs) {
                throw new Error('Fees are required');
            }

            const feeUpdates = feeInputs.map(fee => ({
                ...fee,
                id: fee.id ?? utils.hashKey(),
                amount: Number(fee.amount),
            }));

            if (!existingFees?.length) {
                validateTransactionFees(document.state.global, feeUpdates);
                dispatch(
                    addFeesToGroupTransaction({
                        id: transaction.id,
                        fees: feeUpdates,
                    }),
                );
                return;
            }
            const feeDifferences = diff(existingFees, feeInputs);

            const newFeesToCreate: EditTransactionFeeInput[] = [];
            const feesToUpdate: EditTransactionFeeInput[] = [];
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
                validateTransactionFees(document.state.global, newFeesToCreate);
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
        [dispatch, document.state.global],
    );

    const onSubmitEdit: GroupTransactionsTableProps['onSubmitEdit'] =
        useCallback(
            data => {
                const selectedItem = state.transactions.find(
                    t => t.id === data.id,
                );
                if (!selectedItem) return;
                const newEntryTime = data.entryTime
                    ? new Date(data.entryTime).toISOString()
                    : undefined;
                const newType = data.type;
                const newFixedIncomeAssetId = data.fixedIncomeId;
                const newFixedIncomeAssetAmount = data.fixedIncomeAmount;
                const newCashAmount = data.cashAmount;
                const newTxRef = data.txRef;

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

                if (newTxRef) {
                    update.txRef = newTxRef;
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
                    handleFeeUpdates(data.fees, update);
                }

                if (Object.keys(changedFields).length !== 0) {
                    dispatch(
                        editGroupTransaction({
                            ...changedFields,
                            id: selectedItem.id,
                        } as BaseTransactionInput),
                    );
                }
            },
            [dispatch, handleFeeUpdates, state.transactions],
        );

    const onSubmitCreate: GroupTransactionsTableProps['onSubmitCreate'] =
        useCallback(
            data => {
                const transaction =
                    createNewGroupTransactionFromFormInputs(data);

                dispatch(createGroupTransaction(transaction));
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

    const onSubmitCreateAsset: AssetsTableProps['onSubmitCreate'] = useCallback(
        data => {
            const id = utils.hashKey();
            const name = data.name;
            const maturity = data.maturity
                ? new Date(data.maturity).toISOString()
                : undefined;
            const fixedIncomeTypeId = data.fixedIncomeTypeId;
            const spvId = data.spvId;
            const CUSIP = data.CUSIP;
            const ISIN = data.ISIN;
            const coupon = data.coupon;

            if (!name) throw new Error('Name is required');
            if (!maturity) throw new Error('Maturity is required');
            if (!fixedIncomeTypeId)
                throw new Error('Fixed income type is required');
            if (!spvId) throw new Error('SPV is required');

            dispatch(
                createFixedIncomeAsset({
                    id,
                    name,
                    maturity,
                    fixedIncomeTypeId,
                    spvId,
                    CUSIP,
                    ISIN,
                    coupon,
                }),
            );
        },
        [dispatch],
    );

    const onSubmitCreateServiceProviderFeeType: GroupTransactionsTableProps['onSubmitCreateServiceProviderFeeType'] =
        useCallback(
            data => {
                const id = utils.hashKey();
                const name = data.name;
                const accountId = data.accountId;
                const feeType = data.feeType;

                if (!name) throw new Error('Name is required');
                if (!accountId) throw new Error('Account is required');
                if (!feeType) throw new Error('Fee Type is required');

                dispatch(
                    createServiceProviderFeeType({
                        id,
                        name,
                        accountId,
                        feeType,
                    }),
                );
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
                state={state}
                isAllowedToCreateDocuments={isAllowedToCreateDocuments}
                isAllowedToEditDocuments={isAllowedToEditDocuments}
                onSubmitEdit={onSubmitEdit}
                onSubmitCreate={onSubmitCreate}
                onSubmitDelete={onSubmitDelete}
                onSubmitCreateAsset={onSubmitCreateAsset}
                onSubmitCreateServiceProviderFeeType={
                    onSubmitCreateServiceProviderFeeType
                }
            />
        </div>
    );
};
