import {
    AssetDetails,
    AssetFormInputs,
    FixedIncome,
    FixedIncomeTypeFormInputs,
    RWATableCell,
    RWATableRow,
    SPVFormInputs,
    Table,
    TableItem,
    TableProps,
    TableWrapperProps,
    getCashAsset,
    getFixedIncomeAssets,
    handleTableDatum,
    makeTableData,
    useDocumentOperationState,
} from '@/rwa';
import { Fragment, useMemo, useState } from 'react';
import { twMerge } from 'tailwind-merge';

const columns = [
    { key: 'name' as const, label: 'Name', allowSorting: true },
    {
        key: 'purchaseDate' as const,
        label: 'Purchase Date',
        allowSorting: true,
    },
    { key: 'maturity' as const, label: 'Maturity', allowSorting: true },
    {
        key: 'notional' as const,
        label: 'Notional',
        allowSorting: true,
        isNumberColumn: true,
    },
    {
        key: 'purchasePrice' as const,
        label: 'Purchase Price',
        allowSorting: true,
        isNumberColumn: true,
    },
    {
        key: 'purchaseProceeds' as const,
        label: 'Purchase Proceeds',
        allowSorting: true,
        isNumberColumn: true,
    },
    {
        key: 'salesProceeds' as const,
        label: 'Sales Proceeds',
        allowSorting: true,
        isNumberColumn: true,
    },
    {
        key: 'totalDiscount' as const,
        label: 'Total Discount',
        allowSorting: true,
        isNumberColumn: true,
    },
    {
        key: 'realizedSurplus' as const,
        label: 'Realized Surplus',
        allowSorting: true,
        isNumberColumn: true,
    },
];

export type AssetsTableProps = TableWrapperProps<AssetFormInputs> & {
    onSubmitCreateFixedIncomeType: (data: FixedIncomeTypeFormInputs) => void;
    onSubmitCreateSpv: (data: SPVFormInputs) => void;
};

export function AssetsTable(props: AssetsTableProps) {
    const itemName = 'Asset';
    const { state } = props;
    const assets = getFixedIncomeAssets(state);
    const tableData = useMemo(() => makeTableData(assets), [assets]);
    const [selectedTableItem, setSelectedTableItem] =
        useState<TableItem<FixedIncome>>();
    const { operation, setOperation, showForm, existingState } =
        useDocumentOperationState({ state });

    const cashAsset = getCashAsset(state);

    const cashAssetFormattedAsTableItem = {
        id: 'special-first-row',
        name: 'Cash $USD',
        fixedIncomeTypeId: '--',
        spvId: '--',
        maturity: '--',
        ISIN: '--',
        CUSIP: '--',
        coupon: null,
        notional: cashAsset?.balance ?? 0,
        purchaseDate: '--',
        purchasePrice: '--',
        purchaseProceeds: '--',
        salesProceeds: '--',
        totalDiscount: '--',
        realizedSurplus: '--',
    };

    const specialFirstRow: TableProps<
        FixedIncome,
        TableItem<FixedIncome>
    >['specialFirstRow'] = c => (
        <RWATableRow tdProps={{ colSpan: 100 }}>
            <tr
                className={twMerge(
                    '[&>td:not(:first-child)]:border-l [&>td]:border-gray-300',
                )}
            >
                {c.map(column => (
                    <Fragment key={column.key}>
                        {column.key === 'name' && (
                            <RWATableCell>Cash $USD</RWATableCell>
                        )}
                        {column.key === 'notional' && (
                            <RWATableCell
                                key={column.key}
                                className={
                                    column.isNumberColumn ? 'text-right' : ''
                                }
                            >
                                {handleTableDatum(
                                    cashAssetFormattedAsTableItem[column.key],
                                )}
                            </RWATableCell>
                        )}
                        {column.key !== 'name' && column.key !== 'notional' && (
                            <RWATableCell></RWATableCell>
                        )}
                    </Fragment>
                ))}
            </tr>
        </RWATableRow>
    );

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
                specialFirstRow={specialFirstRow}
            />
            {showForm && (
                <div className="mt-4 rounded-md bg-white">
                    <AssetDetails
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
