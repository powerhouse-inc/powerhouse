import { Icon } from '@/powerhouse';
import {
    Account,
    AccountDetails,
    AccountFormInputs,
    ItemData,
    Table,
    TableItem,
    TableWrapperProps,
    makeTableData,
    useDocumentOperationState,
} from '@/rwa';
import { useMemo, useState } from 'react';

const columns = [
    { key: 'label' as const, label: 'Label', allowSorting: true },
    { key: 'reference' as const, label: 'Reference', allowSorting: true },
];

function makeAccountsTableItems(
    accounts: Account[],
    principalLenderAccountId: string,
) {
    const tableItems = makeTableData(accounts);

    const withCustomTransform = tableItems.map(account => {
        const customTransform = (itemData: ItemData, columnKey: string) => {
            if (
                account.id === principalLenderAccountId &&
                columnKey === 'label'
            )
                return (
                    <>
                        {itemData}{' '}
                        <span className="ml-2 inline-flex items-center gap-1 rounded bg-green-100 px-1 font-extralight">
                            Lender <Icon name="CheckCircle" size={14} />
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

export type AccountsTableProps = TableWrapperProps<AccountFormInputs>;

export function AccountsTable(props: AccountsTableProps) {
    const { state } = props;
    const { accounts, principalLenderAccountId } = state;
    const itemName = 'Account';
    const tableData = useMemo(
        () => makeAccountsTableItems(accounts, principalLenderAccountId),
        [accounts, principalLenderAccountId],
    );
    const [selectedTableItem, setSelectedTableItem] =
        useState<TableItem<Account>>();
    const { operation, setOperation, showForm, existingState } =
        useDocumentOperationState({ state });

    return (
        <>
            <Table
                {...props}
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
                    <AccountDetails
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
