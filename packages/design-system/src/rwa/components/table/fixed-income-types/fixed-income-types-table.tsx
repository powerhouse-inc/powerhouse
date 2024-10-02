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
                columns={columns}
                itemName={itemName}
                operation={operation}
                selectedTableItem={selectedTableItem}
                setOperation={setOperation}
                setSelectedTableItem={setSelectedTableItem}
                tableData={tableData}
            />
            {showForm ? (
                <div className="mt-4 rounded-md bg-white">
                    <FixedIncomeTypeDetails
                        {...props}
                        itemName={itemName}
                        operation={operation}
                        setOperation={setOperation}
                        setSelectedTableItem={setSelectedTableItem}
                        state={existingState}
                        tableItem={selectedTableItem}
                    />
                </div>
            ) : null}
        </>
    );
}
