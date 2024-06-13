import { Icon } from '@/powerhouse';
import {
    Item,
    ItemNumberCell,
    MoreDetailsCell,
    RWATableCell,
    RWATableRow,
    TableBase,
    TableColumn,
    TableItem,
    TableProps,
    defaultColumnCountByTableWidth,
    handleTableDatum,
    useColumnPriority,
    useSortTableItems,
} from '@/rwa';
import { Fragment, useRef } from 'react';
import { FieldValues } from 'react-hook-form';
import { twMerge } from 'tailwind-merge';
import { useTableHeight } from './use-table-height';

/**
 * Generic table with standard styles intended to be used for most of the RWA tables in the app.
 * Also provides forms for creating / editing the table items.
 *
 * @type TItem - Table item type, any record with an "id" field and any string keys
 * @type TFieldValues - Field values type for the forms, must satisfy FieldValues
 * @type TTableData - Table data type, must satisfy TableItem, but can be different from TItem if need be. This is required for situations where the data items need to be transformed before being displayed in the table.
 * @param itemName - Name of an individual item to be used in forms, e.g. "Transaction" or "Asset"
 * @param columns - Array of columns to display, column must satisfy TableColumn. The columns will be displayed in the order they are provided. Use the `useColumnPriority` hook to handle dropping columns for smaller screens.
 * @param tableData - Array of data to display, data must satisfy TTableData
 * @param columnCountByTableWidth - Object that specifies how many columns to show at different screen widths
 * @param expandedRowId - ID of the row that is expanded
 * @param showNewItemForm - Whether to show the form for creating a new item
 * @param setShowNewItemForm - Function to set the showNewItemForm state
 * @param toggleExpandedRow - Function to toggle the expanded row
 * @param editForm - Form component for editing an item. Must be a React component that accepts an `itemId` prop and an `itemNumber` prop. Intended to be used with react-hook-form register/control.
 * @param createForm - Form component for creating an item. Must be a React component. Intended to be used with react-hook-form register/control.
 * @param specialFirstRow - Function to render a special first row (like the cash asset for instance), must return a React element
 */
export function Table<
    TItem extends Item,
    TTableData extends TableItem<TItem>,
    TFieldValues extends FieldValues = FieldValues,
>(props: TableProps<TItem, TTableData, TFieldValues>) {
    const {
        itemName,
        columns,
        tableData,
        selectedTableItem,
        columnCountByTableWidth = defaultColumnCountByTableWidth,
        isAllowedToCreateDocuments,
        operation,
        setSelectedTableItem,
        setOperation,
        specialFirstRow,
    } = props;

    const tableContainerRef = useRef<HTMLDivElement>(null);
    const tableRef = useRef<HTMLTableElement>(null);

    const { sortedItems, sortHandler } = useSortTableItems(tableData);

    const { columnsToShow } = useColumnPriority({
        columns,
        columnCountByTableWidth,
        tableContainerRef,
    });

    const maxHeight = useTableHeight({
        tableRef,
        selectedRowNumber: selectedTableItem?.itemNumber,
        hasSpecialFirstRow: !!specialFirstRow,
    });

    function onCreateItemClick() {
        setSelectedTableItem(undefined);
        setOperation('create');
    }

    const renderRow = (
        tableItem: TTableData,
        columns: TableColumn<TItem, TTableData>[],
    ) => {
        const isSelected = selectedTableItem?.id === tableItem.id;

        return (
            <RWATableRow
                isExpanded={selectedTableItem?.id === tableItem.id}
                tdProps={{ colSpan: 100 }}
                key={tableItem.id}
            >
                <tr
                    key={tableItem.id}
                    className={twMerge(
                        '[&>td:not(:first-child)]:border-l [&>td:not(:first-child)]:border-gray-300',
                        tableItem.itemNumber % 2 !== 0 && 'bg-gray-50',
                    )}
                >
                    {columns.map(column => (
                        <Fragment key={column.key}>
                            {column.key === 'itemNumber' && (
                                <ItemNumberCell
                                    itemNumber={tableItem.itemNumber}
                                />
                            )}
                            {column.key !== 'itemNumber' &&
                                column.key !== 'moreDetails' && (
                                    <RWATableCell
                                        key={column.key}
                                        className={
                                            column.isNumberColumn
                                                ? 'text-right'
                                                : ''
                                        }
                                    >
                                        {tableItem.customTransform?.(
                                            tableItem[column.key],
                                            column.key,
                                        ) ??
                                            handleTableDatum(
                                                tableItem[column.key],
                                            )}
                                    </RWATableCell>
                                )}
                            {column.key === 'moreDetails' && (
                                <MoreDetailsCell
                                    isSelected
                                    onClick={() => {
                                        if (isSelected) {
                                            setOperation(null);
                                            setSelectedTableItem(undefined);
                                            return;
                                        }
                                        setOperation('view');
                                        setSelectedTableItem(tableItem);
                                    }}
                                />
                            )}
                        </Fragment>
                    ))}
                </tr>
            </RWATableRow>
        );
    };

    return (
        <>
            <TableBase
                onClickSort={sortHandler}
                ref={tableContainerRef}
                tableRef={tableRef}
                tableData={sortedItems}
                columns={columnsToShow}
                maxHeight={maxHeight}
                renderRow={renderRow}
                specialFirstRow={specialFirstRow}
            />
            {isAllowedToCreateDocuments && !operation && (
                <>
                    <button
                        onClick={onCreateItemClick}
                        className="mt-4 flex h-11 w-full items-center justify-center gap-x-2 rounded-lg border border-gray-300 bg-white text-sm font-semibold text-gray-900"
                    >
                        <span>Create {itemName}</span>
                        <Icon name="plus" size={14} />
                    </button>
                </>
            )}
        </>
    );
}
