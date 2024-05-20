import {
    AssetDetails,
    AssetsTableProps,
    RWATableCell,
    RWATableRow,
    Table,
    TableColumn,
    addItemNumber,
    getCashAsset,
    getFixedIncomeAssets,
    getItemById,
    handleTableDatum,
} from '@/rwa';
import { Fragment, useMemo } from 'react';
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

export function AssetsTable(props: AssetsTableProps) {
    const { state, selectedItem, onSubmitCreate, onSubmitEdit } = props;
    const itemName = 'Asset';

    const assets = getFixedIncomeAssets(state);
    const cashAsset = getCashAsset(state);

    const tableData = useMemo(() => addItemNumber(assets), [assets]);

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

    const editForm = ({
        itemId,
        itemNumber,
    }: {
        itemId: string;
        itemNumber: number;
    }) => (
        <AssetDetails
            {...props}
            itemName={itemName}
            item={getItemById(itemId, assets)}
            itemNumber={itemNumber}
            operation={selectedItem?.id === itemId ? 'edit' : 'view'}
            onSubmitForm={onSubmitEdit}
        />
    );

    const createForm = () => (
        <AssetDetails
            {...props}
            itemName={itemName}
            itemNumber={assets.length + 1}
            operation="create"
            onSubmitForm={onSubmitCreate}
        />
    );

    const specialFirstRow = (c: TableColumn<(typeof tableData)[number]>[]) => (
        <RWATableRow tdProps={{ colSpan: 100 }} accordionContent={undefined}>
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
        <Table
            {...props}
            itemName={itemName}
            tableData={tableData}
            columns={columns}
            editForm={editForm}
            createForm={createForm}
            specialFirstRow={specialFirstRow}
        />
    );
}
