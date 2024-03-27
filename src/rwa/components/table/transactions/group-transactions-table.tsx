import {
    FixedIncome,
    GroupTransaction,
    GroupTransactionDetails,
    GroupTransactionsTableProps,
    Table,
    addItemNumber,
    getItemById,
} from '@/rwa';
import { useMemo } from 'react';

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

export function makeGroupTransactionTableData(
    transactions: GroupTransaction[] | undefined,
    fixedIncomes: FixedIncome[] | undefined,
) {
    if (!transactions?.length || !fixedIncomes?.length) return [];

    const tableData = transactions.map(transaction => {
        return {
            id: transaction.id,
            entryTime: transaction.entryTime,
            asset: fixedIncomes.find(
                asset =>
                    asset.id === transaction.fixedIncomeTransaction?.assetId,
            )?.name,
            quantity: transaction.fixedIncomeTransaction?.amount,
            cashAmount: transaction.cashTransaction?.amount,
            cashBalanceChange: transaction.cashBalanceChange,
        };
    });

    const withItemNumber = addItemNumber(tableData);

    return withItemNumber;
}

export function GroupTransactionsTable(props: GroupTransactionsTableProps) {
    const {
        transactions,
        fixedIncomes,
        selectedItem,
        onSubmitCreate,
        onSubmitEdit,
    } = props;

    const itemName = 'Group Transaction';

    const tableData = useMemo(
        () => makeGroupTransactionTableData(transactions, fixedIncomes),
        [transactions, fixedIncomes],
    );

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
        <Table
            {...props}
            itemName={itemName}
            tableData={tableData}
            columns={columns}
            editForm={editForm}
            createForm={createForm}
        />
    );
}
