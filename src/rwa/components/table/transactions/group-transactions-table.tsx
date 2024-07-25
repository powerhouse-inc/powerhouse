import { Combobox } from '@/connect';
import {
    AssetFormInputs,
    FEES_INCOME,
    FixedIncome,
    GroupTransaction,
    GroupTransactionDetails,
    GroupTransactionFormInputs,
    GroupTransactionsTableItem,
    ServiceProviderFeeTypeFormInputs,
    Table,
    TableItem,
    TableWrapperProps,
    allGroupTransactionTypes,
    assetTransactionSignByTransactionType,
    cashTransactionSignByTransactionType,
    feesTransactions,
    groupTransactionTypeLabels,
    isAssetGroupTransactionType,
    isFixedIncomeAsset,
    makeFixedIncomeOptionLabel,
    makeTableData,
    useDocumentOperationState,
} from '@/rwa';
import { useEffect, useMemo, useState } from 'react';

const columns = [
    {
        key: 'typeLabel' as const,
        label: 'Type',
        allowSorting: true,
    },
    {
        key: 'entryTime' as const,
        label: 'Entry Time',
        allowSorting: true,
    },
    {
        key: 'asset' as const,
        label: 'Asset',
        allowSorting: true,
    },
    {
        key: 'quantity' as const,
        label: 'Quantity',
        allowSorting: true,
        isNumberColumn: true,
    },
    {
        key: 'cashAmount' as const,
        label: 'Cash Amount ($)',
        allowSorting: true,
        isNumberColumn: true,
    },
    {
        key: 'totalFees' as const,
        label: 'Total Fees ($)',
        allowSorting: true,
        isNumberColumn: true,
    },
    {
        key: 'cashBalanceChange' as const,
        label: 'Cash Balance Change ($)',
        allowSorting: true,
        isNumberColumn: true,
    },
];

function maybeAddSignToAmount(amount: number | undefined, sign: 1 | -1) {
    if (!amount) return amount;
    return amount * sign;
}

export function makeGroupTransactionsTableItems(
    transactions: GroupTransaction[] | undefined,
    fixedIncomes: FixedIncome[] | undefined,
): GroupTransactionsTableItem[] {
    if (!transactions?.length) return [];

    const tableData = transactions.map(transaction => {
        const id = transaction.id;
        const entryTime = transaction.entryTime;
        const asset = fixedIncomes?.find(
            asset => asset.id === transaction.fixedIncomeTransaction?.assetId,
        )?.name;
        const type = transaction.type;
        const typeLabel = groupTransactionTypeLabels[type];
        const cashTransactionSign = cashTransactionSignByTransactionType[type];
        const assetTransactionSign = isAssetGroupTransactionType(type)
            ? assetTransactionSignByTransactionType[type]
            : 1;
        const quantity = maybeAddSignToAmount(
            transaction.fixedIncomeTransaction?.amount,
            assetTransactionSign,
        );
        const cashAmount = maybeAddSignToAmount(
            transaction.cashTransaction?.amount,
            cashTransactionSign,
        );
        const totalFees = feesTransactions.includes(transaction.type)
            ? (maybeAddSignToAmount(
                  transaction.cashTransaction?.amount,
                  transaction.type === FEES_INCOME ? -1 : 1,
              ) ?? 0)
            : (transaction.fees?.reduce((acc, fee) => acc + fee.amount, 0) ??
              0);
        const cashBalanceChange = transaction.cashBalanceChange;

        return {
            ...transaction,
            id,
            type,
            typeLabel,
            entryTime,
            asset,
            quantity,
            cashAmount,
            totalFees,
            cashBalanceChange,
        };
    });

    return makeTableData(tableData);
}

export type GroupTransactionsTableProps =
    TableWrapperProps<GroupTransactionFormInputs> & {
        onSubmitCreateAsset: (data: AssetFormInputs) => void;
        onSubmitCreateServiceProviderFeeType: (
            data: ServiceProviderFeeTypeFormInputs,
        ) => void;
    };

export function GroupTransactionsTable(props: GroupTransactionsTableProps) {
    const itemName = 'Group Transaction';
    const { state } = props;
    const [selectedTableItem, setSelectedTableItem] =
        useState<TableItem<GroupTransactionsTableItem>>();
    const { transactions, portfolio } = state;
    const { operation, setOperation, showForm, existingState } =
        useDocumentOperationState({ state });
    const fixedIncomes = portfolio.filter(a => isFixedIncomeAsset(a));

    const [filteredTransactions, setFilteredTransactions] =
        useState(transactions);

    const [filterAssetId, setFilterAssetId] = useState<string>();
    const [filterTypes, setFilterTypes] = useState<
        (keyof typeof allGroupTransactionTypes)[]
    >([]);

    useEffect(() => {
        if (!filterAssetId && !filterTypes.length) {
            setFilteredTransactions(transactions);
            return;
        }

        setFilteredTransactions(
            transactions.filter(transaction => {
                if (filterAssetId && filterTypes.length) {
                    return (
                        transaction.fixedIncomeTransaction?.assetId ===
                            filterAssetId &&
                        filterTypes.includes(transaction.type)
                    );
                }

                if (filterAssetId) {
                    return (
                        transaction.fixedIncomeTransaction?.assetId ===
                        filterAssetId
                    );
                }

                if (filterTypes.length) {
                    return filterTypes.includes(transaction.type);
                }
            }),
        );
    }, [filterAssetId, filterTypes, transactions]);

    const filterByAssetOptions = useMemo(
        () =>
            fixedIncomes.map(asset => ({
                label: makeFixedIncomeOptionLabel(asset),
                value: asset.id,
            })),
        [fixedIncomes],
    );

    const filterByTypeOptions = useMemo(
        () =>
            allGroupTransactionTypes.map(type => ({
                label: groupTransactionTypeLabels[type],
                value: type,
            })),
        [],
    );

    const tableData = useMemo(
        () =>
            makeTableData(
                makeGroupTransactionsTableItems(
                    filteredTransactions,
                    fixedIncomes,
                ),
            ),
        [filteredTransactions, fixedIncomes],
    );

    function handleFilterByAssetChange(update: unknown) {
        if (!update || !(typeof update === 'object') || !('value' in update)) {
            setFilterAssetId(undefined);
            return;
        }

        const { value: assetId } = update;

        setFilterAssetId(assetId as string);
    }

    function handleFilterByTypeChange(update: unknown) {
        if (!update || !Array.isArray(update)) {
            setFilterTypes([]);
            return;
        }

        const _update = update as {
            value: keyof typeof allGroupTransactionTypes;
        }[];

        setFilterTypes(_update.map(({ value }) => value));
    }

    return (
        <>
            <div className="mb-2 flex gap-2">
                <div className="min-w-72 max-w-96">
                    <Combobox
                        options={filterByAssetOptions}
                        onChange={handleFilterByAssetChange}
                        isClearable
                        placeholder="Filter by Asset"
                    />
                </div>
                <div className="min-w-72 max-w-96">
                    <Combobox
                        options={filterByTypeOptions}
                        onChange={handleFilterByTypeChange}
                        isClearable
                        isMulti
                        placeholder="Filter by Type"
                    />
                </div>
            </div>
            <Table
                {...props}
                state={state}
                itemName={itemName}
                tableData={tableData}
                columns={columns}
                selectedTableItem={selectedTableItem}
                operation={operation}
                setSelectedTableItem={setSelectedTableItem}
                setOperation={setOperation}
            />
            {showForm && (
                <div className="mt-4 rounded-md bg-white">
                    <GroupTransactionDetails
                        {...props}
                        itemName={itemName}
                        state={existingState}
                        tableItem={selectedTableItem}
                        operation={operation}
                        setSelectedTableItem={setSelectedTableItem}
                        setOperation={setOperation}
                    />
                </div>
            )}
        </>
    );
}
