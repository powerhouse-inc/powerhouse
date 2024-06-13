import {
    FixedIncomeType,
    FixedIncomeTypeDetails,
    FixedIncomeTypeFormInputs,
    Table,
    TableItem,
    TableWrapperProps,
    makeTableData,
    useDocumentOperationState,
} from '@/rwa';
import { useMemo, useState } from 'react';

const columns = [{ key: 'name' as const, label: 'Name', allowSorting: true }];

export type FixedIncomeTypesTableProps =
    TableWrapperProps<FixedIncomeTypeFormInputs>;
export function FixedIncomeTypesTable(props: FixedIncomeTypesTableProps) {
    const { state } = props;
    const { fixedIncomeTypes } = state;
    const itemName = 'Fixed Income Type';
    const tableData = useMemo(
        () => makeTableData(fixedIncomeTypes),
        [fixedIncomeTypes],
    );
    const [selectedTableItem, setSelectedTableItem] =
        useState<TableItem<FixedIncomeType>>();
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
                    <FixedIncomeTypeDetails
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
