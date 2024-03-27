import {
    FixedIncomeTypeDetails,
    FixedIncomeTypesTableProps,
    Table,
    addItemNumber,
    getItemById,
} from '@/rwa';

const columns = [{ key: 'name' as const, label: 'Name', allowSorting: true }];

export function FixedIncomeTypesTable(props: FixedIncomeTypesTableProps) {
    const { fixedIncomeTypes, selectedItem, onSubmitCreate, onSubmitEdit } =
        props;
    const itemName = 'Fixed Income Type';
    const tableData = addItemNumber(fixedIncomeTypes);

    const editForm = ({
        itemId,
        itemNumber,
    }: {
        itemId: string;
        itemNumber: number;
    }) => (
        <FixedIncomeTypeDetails
            {...props}
            itemName={itemName}
            item={getItemById(itemId, fixedIncomeTypes)}
            itemNumber={itemNumber}
            operation={selectedItem?.id === itemId ? 'edit' : 'view'}
            onSubmitForm={onSubmitEdit}
        />
    );

    const createForm = () => (
        <FixedIncomeTypeDetails
            {...props}
            itemName={itemName}
            itemNumber={fixedIncomeTypes.length + 1}
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
