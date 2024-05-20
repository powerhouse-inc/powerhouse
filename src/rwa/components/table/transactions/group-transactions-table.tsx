import { Combobox } from '@/connect/components/combobox';
import {
    FixedIncome,
    GroupTransaction,
    GroupTransactionDetails,
    GroupTransactionsTableProps,
    Table,
    addItemNumber,
    assetTransactionSignByTransactionType,
    cashTransactionSignByTransactionType,
    getItemById,
    isAssetGroupTransactionType,
    isFixedIncomeAsset,
    makeFixedIncomeOptionLabel,
} from '@/rwa';
import { useMemo, useState } from 'react';

const columns = [
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

export function makeGroupTransactionTableData(
    transactions: GroupTransaction[] | undefined,
    fixedIncomes: FixedIncome[] | undefined,
) {
    if (!transactions?.length) return [];

    const tableData = transactions.map(transaction => {
        const id = transaction.id;
        const entryTime = transaction.entryTime;
        const asset = fixedIncomes?.find(
            asset => asset.id === transaction.fixedIncomeTransaction?.assetId,
        )?.name;
        const type = transaction.type;
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
        const cashBalanceChange = transaction.cashBalanceChange;

        return {
            id,
            type,
            entryTime,
            asset,
            quantity,
            cashAmount,
            cashBalanceChange,
        };
    });

    const withItemNumber = addItemNumber(tableData);

    return withItemNumber;
}

export function GroupTransactionsTable(props: GroupTransactionsTableProps) {
    const { state, selectedItem, onSubmitCreate, onSubmitEdit } = props;

    const { transactions, portfolio } = state;

    const fixedIncomes = portfolio.filter(a =>
        isFixedIncomeAsset(a),
    ) as FixedIncome[];

    const itemName = 'Group Transaction';

    const [filteredTransactions, setFilteredTransactions] =
        useState(transactions);

    const filterByAssetOptions = useMemo(
        () =>
            fixedIncomes.map(asset => ({
                label: makeFixedIncomeOptionLabel(asset),
                value: asset.id,
            })),
        [fixedIncomes],
    );

    const tableData = useMemo(
        () => makeGroupTransactionTableData(filteredTransactions, fixedIncomes),
        [filteredTransactions, fixedIncomes],
    );

    function handleFilterByAssetChange(update: unknown) {
        if (!update || !(typeof update === 'object') || !('value' in update)) {
            setFilteredTransactions(transactions);
            return;
        }

        const { value: assetId } = update;

        setFilteredTransactions(
            transactions.filter(
                transaction =>
                    transaction.fixedIncomeTransaction?.assetId === assetId,
            ),
        );
    }

    const editForm = ({
        itemId,
        itemNumber,
    }: {
        itemId: string;
        itemNumber: number;
    }) => (
        <GroupTransactionDetails
            {...props}
            itemName={itemName}
            item={getItemById(itemId, transactions)}
            itemNumber={itemNumber}
            operation={selectedItem?.id === itemId ? 'edit' : 'view'}
            onSubmitForm={onSubmitEdit}
        />
    );

    const createForm = () => (
        <GroupTransactionDetails
            {...props}
            itemName={itemName}
            operation="create"
            itemNumber={transactions.length + 1}
            onSubmitForm={onSubmitCreate}
        />
    );

    return (
        <>
            <div className="mb-4 max-w-96">
                <Combobox
                    options={filterByAssetOptions}
                    onChange={handleFilterByAssetChange}
                    placeholder="Filter by Asset"
                />
            </div>
            <Table
                {...props}
                itemName={itemName}
                tableData={tableData}
                columns={columns}
                editForm={editForm}
                createForm={createForm}
            />
        </>
    );
}
