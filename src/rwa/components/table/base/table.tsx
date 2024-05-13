import { Icon } from '@/powerhouse';
import {
    ItemNumberCell,
    MoreDetailsCell,
    RWATableCell,
    RWATableRow,
    SpecialColumns,
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
    TItem extends TableItem,
    TFieldValues extends FieldValues = FieldValues,
    TTableData extends TableItem = TItem,
>(props: TableProps<TItem, TFieldValues, TTableData>) {
    const {
        itemName,
        columns,
        tableData,
        columnCountByTableWidth = defaultColumnCountByTableWidth,
        expandedRowId,
        showNewItemForm,
        isAllowedToCreateDocuments,
        isAllowedToEditDocuments,
        setShowNewItemForm,
        toggleExpandedRow,
        editForm: EditForm,
        createForm: CreateForm,
        specialFirstRow,
    } = props;

    const tableContainerRef = useRef<HTMLDivElement>(null);

    const { sortedItems, sortHandler } = useSortTableItems(tableData ?? []);

    const { columnsToShow } = useColumnPriority({
        columns,
        columnCountByTableWidth,
        tableContainerRef,
    });

    const renderRow = (
        item: TTableData,
        columns: TableColumn<TTableData & SpecialColumns>[],
        index: number,
    ) => {
        const maybeModifiedIndex = specialFirstRow ? index + 1 : index;

        return (
            <RWATableRow
                isExpanded={expandedRowId === item.id}
                tdProps={{ colSpan: 100 }}
                key={item.id}
                accordionContent={
                    expandedRowId === item.id && (
                        <EditForm
                            itemId={item.id}
                            itemNumber={item.itemNumber ?? index}
                            isAllowedToEditDocuments={isAllowedToEditDocuments}
                        />
                    )
                }
            >
                <tr
                    key={item.id}
                    className={twMerge(
                        '[&>td:not(:first-child)]:border-l [&>td:not(:first-child)]:border-gray-300',
                        maybeModifiedIndex % 2 !== 0 && 'bg-gray-50',
                    )}
                >
                    {columns.map(column => (
                        <Fragment key={column.key}>
                            {column.key === 'itemNumber' && (
                                <ItemNumberCell
                                    itemNumber={item.itemNumber ?? index + 1}
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
                                        {item.customTransform?.(
                                            item[column.key],
                                            column.key,
                                        ) ?? handleTableDatum(item[column.key])}
                                    </RWATableCell>
                                )}
                            {column.key === 'moreDetails' && (
                                <MoreDetailsCell
                                    id={item.id}
                                    expandedRowId={expandedRowId}
                                    toggleExpandedRow={toggleExpandedRow}
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
                tableData={sortedItems}
                columns={columnsToShow}
                renderRow={renderRow}
                specialFirstRow={specialFirstRow}
            />
            {isAllowedToCreateDocuments && (
                <>
                    <button
                        onClick={() => setShowNewItemForm(true)}
                        className="mt-4 flex h-11 w-full items-center justify-center gap-x-2 rounded-lg border border-gray-300 bg-white text-sm font-semibold text-gray-900"
                    >
                        <span>Create {itemName}</span>
                        <Icon name="plus" size={14} />
                    </button>
                    {showNewItemForm && (
                        <div className="mt-4 rounded-md bg-white">
                            <CreateForm />
                        </div>
                    )}
                </>
            )}
        </>
    );
}
