import { Icon } from '@/powerhouse';
import {
    Account,
    AccountDetails,
    AccountsTableProps,
    ItemData,
    Table,
    addItemNumber,
    getItemById,
} from '@/rwa';
import { useMemo } from 'react';

const columns = [
    { key: 'label' as const, label: 'Label', allowSorting: true },
    { key: 'reference' as const, label: 'Reference', allowSorting: true },
];

function makeAccountsTableData(
    accounts: Account[],
    principalLenderAccountId: string,
) {
    const withItemNumber = addItemNumber(accounts);

    const withCustomTransform = withItemNumber.map(account => {
        const customTransform = (itemData: ItemData, columnKey: string) => {
            if (
                account.id === principalLenderAccountId &&
                columnKey === 'label'
            )
                return (
                    <>
                        {itemData}{' '}
                        <span className="ml-2 inline-flex items-center gap-1 rounded bg-green-100 px-1 font-extralight">
                            Lender <Icon name="check-circle" size={14} />
                        </span>
                    </>
                );
        };
        return {
            ...account,
            customTransform,
        };
    });

    return withCustomTransform;
}

export function AccountsTable(props: AccountsTableProps) {
    const { state, selectedItem, onSubmitCreate, onSubmitEdit } = props;
    const { accounts, principalLenderAccountId } = state;
    const itemName = 'Account';
    const tableData = useMemo(
        () => makeAccountsTableData(accounts, principalLenderAccountId),
        [accounts, principalLenderAccountId],
    );

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
