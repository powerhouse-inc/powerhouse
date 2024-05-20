import {
    SPVDetails,
    SPVsTableProps,
    Table,
    addItemNumber,
    getItemById,
} from '@/rwa';
import { useMemo } from 'react';

const columns = [{ key: 'name' as const, label: 'Name', allowSorting: true }];

export function SPVsTable(props: SPVsTableProps) {
    const { state, selectedItem, onSubmitCreate, onSubmitEdit } = props;
    const { spvs } = state;

    const itemName = 'SPV';

    const tableData = useMemo(() => addItemNumber(spvs), [spvs]);

    const editForm = ({
        itemId,
        itemNumber,
    }: {
        itemId: string;
        itemNumber: number;
    }) => (
        <SPVDetails
            {...props}
            itemName={itemName}
            item={getItemById(itemId, spvs)}
            itemNumber={itemNumber}
            operation={selectedItem?.id === itemId ? 'edit' : 'view'}
            onSubmitForm={onSubmitEdit}
        />
    );

    const createForm = () => (
        <SPVDetails
            {...props}
            itemName={itemName}
            itemNumber={spvs.length + 1}
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
