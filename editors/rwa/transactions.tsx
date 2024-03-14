import {
    CashAsset,
    Fields,
    GroupTransactionDetailInputs,
    GroupTransactionType,
    GroupTransactionsTable,
    GroupTransactionsTableProps,
    TransactionFee,
    FixedIncome as UiFixedIncome,
    GroupTransaction as UiGroupTransaction,
} from '@powerhousedao/design-system';
import { copy } from 'copy-anything';
import { Maybe, utils } from 'document-model/document';
import diff from 'microdiff';
import { useCallback, useState } from 'react';
import {
    BaseTransaction,
    Cash,
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
    editGroupTransaction,
    editGroupTransactionFees,
    removeFeesFromGroupTransaction,
} from '../../document-models/real-world-assets/gen/creators';
import { IProps } from './editor';

const columnCountByTableWidth = {
    1520: 12,
    1394: 11,
    1239: 10,
    1112: 9,
    984: 8,
};

const fieldsPriority: (keyof Fields)[] = [
    'Entry time',
    'Asset',
    'Quantity',
    'Cash Amount',
    'Cash Balance Change',
];

function delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export const Transactions = (props: IProps) => {
    const { dispatch, document } = props;

    const transactions = document.state.global.transactions;

    const fixedIncomeAssets = document.state.global.portfolio
        .filter((asset): asset is FixedIncome => isFixedIncomeAsset(asset))
        .map(item => ({
            ...item,
            maturity: item.maturity.split('T')[0],
            purchaseDate: item.purchaseDate.split('T')[0],
        })) as FixedIncome[];

    const cashAssets = document.state.global.portfolio.filter(
        (asset): asset is Cash => isCashAsset(asset),
    ) as CashAsset[];

    // there is only one cash asset for v1
    const cashAsset = cashAssets[0];

    const principalLenderAccountId =
        document.state.global.principalLenderAccountId;

    const serviceProviderFeeTypes =
        document.state.global.serviceProviderFeeTypes;

    const [expandedRowId, setExpandedRowId] = useState<string>();
    const [selectedGroupTransactionToEdit, setSelectedGroupTransactionToEdit] =
        useState<UiGroupTransaction>();
    const [showNewGroupTransactionForm, setShowNewGroupTransactionForm] =
        useState(false);

    function calculateCashBalanceChange(
        transactionType: GroupTransactionType | undefined,
        cashAmount: number | undefined,
        fees: Maybe<TransactionFee[]> | undefined,
    ) {
        if (!cashAmount || !transactionType) return 0;

        const operation = transactionType === 'AssetPurchase' ? -1 : 1;

        const totalFees = fees
            ? fees.reduce((acc, fee) => acc + Number(fee.amount), 0)
            : 0;

        return Number(cashAmount) * operation - totalFees;
    }

    const createNewGroupTransactionFromFormInputs = useCallback(
        (data: GroupTransactionDetailInputs) => {
            const { cashAmount, fixedIncomeId, fixedIncomeAmount, type } = data;

            if (!type) throw new Error('Type is required');
            if (!data.entryTime) throw new Error('Entry time is required');

            const entryTime = new Date(data.entryTime).toISOString();

            const fees =
                data.fees?.map(fee => ({
                    ...fee,
                    id: utils.hashKey(),
                    amount: Number(fee.amount),
                })) ?? null;

            const cashTransaction = cashAmount
                ? {
                      id: utils.hashKey(),
                      assetId: cashAsset.id,
                      entryTime,
                      counterPartyAccountId: principalLenderAccountId,
                      amount: Number(cashAmount),
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
                          amount: Number(fixedIncomeAmount),
                          entryTime,
                          counterPartyAccountId: null,
                          settlementTime: null,
                          tradeTime: null,
                          txRef: null,
                      }
                    : null;

            const cashBalanceChange = calculateCashBalanceChange(
                type,
                cashAmount,
                fees,
            );

            const groupTransaction = {
                id: utils.hashKey(),
                type,
                cashTransaction,
                cashBalanceChange,
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

    const toggleExpandedRow = useCallback((id: string) => {
        setExpandedRowId(curr => (id === curr ? undefined : id));
    }, []);

    const onClickDetails: GroupTransactionsTableProps['onClickDetails'] =
        useCallback(() => {}, []);

    const onCancelEdit: GroupTransactionsTableProps['onCancelEdit'] =
        useCallback(() => {
            setSelectedGroupTransactionToEdit(undefined);
        }, []);

    const handleFeeUpdates = useCallback(
        async (
            feeInputs: Maybe<TransactionFee[]> | undefined,
            transaction: GroupTransaction,
        ) => {
            if (!feeInputs) {
                return;
            }

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
                await delay(100);
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
                await delay(100);
            }
            if (feesToUpdate.length) {
                dispatch(
                    editGroupTransactionFees({
                        id: transaction.id,
                        fees: feesToUpdate,
                    }),
                );
                await delay(100);
            }
            if (feeIdsToRemove.length) {
                dispatch(
                    removeFeesFromGroupTransaction({
                        id: transaction.id,
                        feeIds: feeIdsToRemove,
                    }),
                );
                await delay(100);
            }
        },
        [dispatch],
    );

    const onSubmitEdit: GroupTransactionsTableProps['onSubmitEdit'] =
        useCallback(
            async data => {
                if (!selectedGroupTransactionToEdit) return;

                const newEntryTime = data.entryTime
                    ? new Date(data.entryTime).toISOString()
                    : undefined;
                const newType = data.type;
                const newFixedIncomeAssetId = data.fixedIncomeId;
                const newFixedIncomeAssetAmount = data.fixedIncomeAmount
                    ? Number(data.fixedIncomeAmount)
                    : undefined;
                const newCashAmount = data.cashAmount
                    ? Number(data.cashAmount)
                    : undefined;
                const newCashBalanceChange =
                    newType || newCashAmount || data.fees
                        ? calculateCashBalanceChange(
                              newType,
                              newCashAmount,
                              data.fees,
                          )
                        : undefined;

                const existingCashTransaction =
                    selectedGroupTransactionToEdit.cashTransaction;

                const existingFixedIncomeTransaction =
                    selectedGroupTransactionToEdit.fixedIncomeTransaction;

                if (
                    !existingCashTransaction ||
                    !existingFixedIncomeTransaction
                ) {
                    throw new Error(
                        'This group transaction was misconfigured, fixed income or cash transaction is missing',
                    );
                }

                const update = copy(selectedGroupTransactionToEdit);

                if (newType) {
                    update.type = newType;
                }

                if (newEntryTime) {
                    update.entryTime = newEntryTime;
                }

                // use direct comparison to avoid false positives on zero
                if (newCashAmount !== undefined) {
                    update.cashTransaction!.amount = newCashAmount;
                }

                if (newFixedIncomeAssetId) {
                    update.fixedIncomeTransaction!.assetId =
                        newFixedIncomeAssetId;
                }

                // use direct comparison to avoid false positives on zero
                if (newFixedIncomeAssetAmount !== undefined) {
                    update.fixedIncomeTransaction!.amount =
                        newFixedIncomeAssetAmount;
                }

                if (newCashBalanceChange !== undefined) {
                    update.cashBalanceChange = newCashBalanceChange;
                }

                let changedFields = getDifferences(
                    selectedGroupTransactionToEdit,
                    update,
                );

                if ('fixedIncomeTransaction' in changedFields) {
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
                    await handleFeeUpdates(
                        data.fees,
                        update as GroupTransaction,
                    );
                }

                if (Object.keys(changedFields).length !== 0) {
                    dispatch(
                        editGroupTransaction({
                            ...changedFields,
                            id: selectedGroupTransactionToEdit.id,
                        }),
                    );
                }

                setSelectedGroupTransactionToEdit(undefined);
            },
            [dispatch, selectedGroupTransactionToEdit, handleFeeUpdates],
        );

    const onSubmitCreate: GroupTransactionsTableProps['onSubmitCreate'] =
        useCallback(
            data => {
                const transaction =
                    createNewGroupTransactionFromFormInputs(data);

                dispatch(createGroupTransaction(transaction));
                setShowNewGroupTransactionForm(false);
            },
            [createNewGroupTransactionFromFormInputs, dispatch],
        );

    return (
        <div>
            <h1 className="text-lg font-bold mb-2">Transactions</h1>
            <p className="text-xs text-gray-600 mb-4">
                Details of this portfolios transactions
            </p>
            <GroupTransactionsTable
                columnCountByTableWidth={columnCountByTableWidth}
                fieldsPriority={fieldsPriority}
                fixedIncomes={fixedIncomeAssets as UiFixedIncome[]}
                cashAssets={cashAssets}
                items={transactions}
                serviceProviderFeeTypes={serviceProviderFeeTypes}
                expandedRowId={expandedRowId}
                toggleExpandedRow={toggleExpandedRow}
                onClickDetails={onClickDetails}
                selectedGroupTransactionToEdit={selectedGroupTransactionToEdit}
                principalLenderAccountId={principalLenderAccountId}
                setSelectedGroupTransactionToEdit={
                    setSelectedGroupTransactionToEdit
                }
                onCancelEdit={onCancelEdit}
                onSubmitEdit={onSubmitEdit}
                onSubmitCreate={onSubmitCreate}
                showNewGroupTransactionForm={showNewGroupTransactionForm}
                setShowNewGroupTransactionForm={setShowNewGroupTransactionForm}
            />
        </div>
    );
};
