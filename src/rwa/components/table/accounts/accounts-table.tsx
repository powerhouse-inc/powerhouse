import {
    AccountDetails,
    AccountsTableProps,
    Table,
    addItemNumber,
    getItemById,
} from '@/rwa';
import { useMemo } from 'react';

const columns = [
    { key: 'label' as const, label: 'Label', allowSorting: true },
    { key: 'reference' as const, label: 'Reference', allowSorting: true },
];

export function AccountsTable(props: AccountsTableProps) {
    const { accounts, selectedItem, onSubmitCreate, onSubmitEdit } = props;
    const itemName = 'Account';
    const tableData = useMemo(() => addItemNumber(accounts), [accounts]);

    const editForm = ({
        itemId,
        itemNumber,
    }: {
        itemId: string;
        itemNumber: number;
    }) => (
        <AccountDetails
            {...props}
            itemName={itemName}
            item={getItemById(itemId, accounts)}
            itemNumber={itemNumber}
            operation={selectedItem?.id === itemId ? 'edit' : 'view'}
            onSubmitForm={onSubmitEdit}
        />
    );

    const createForm = () => (
        <AccountDetails
            {...props}
            itemName={itemName}
            itemNumber={accounts.length + 1}
            operation="create"
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
