import {
    SPV,
    SPVDetails,
    SPVFormInputs,
    Table,
    TableItem,
    TableWrapperProps,
    makeTableData,
    useDocumentOperationState,
} from '@/rwa';
import { useMemo, useState } from 'react';

const columns = [{ key: 'name' as const, label: 'Name', allowSorting: true }];

export type SPVsTableProps = TableWrapperProps<SPVFormInputs>;

export function SPVsTable(props: SPVsTableProps) {
    const { state } = props;
    const { spvs } = state;

    const itemName = 'SPV';

    const tableData = useMemo(() => makeTableData(spvs), [spvs]);

    const [selectedTableItem, setSelectedTableItem] =
        useState<TableItem<SPV>>();
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
                    <SPVDetails
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
