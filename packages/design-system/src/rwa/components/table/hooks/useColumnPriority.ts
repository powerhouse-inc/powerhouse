import { ColumnCountByTableWidth, Item, TableColumn, TableItem } from '@/rwa';
import { useCallback, useEffect, useMemo, useState } from 'react';

type Props<TItem extends Item, TTableData extends TableItem<TItem>> = {
    columns: TableColumn<TItem, TTableData>[] | undefined;
    columnCountByTableWidth: ColumnCountByTableWidth;
    tableContainerRef: React.RefObject<HTMLDivElement>;
    hasItemNumberColumn?: boolean;
    hasMoreDetailsColumn?: boolean;
};

/**
 * Hook to handle dropping columns for smaller screens.
 *
 * @param columns - Array of columns to display, column must satisfy TableColumn. The columns will be displayed in the order they are provided.
 * @param columnCountByTableWidth - Object that specifies how many columns to show at different screen widths
 * @param tableContainerRef - Ref to the table container element
 * @param hasIndexColumn - When true, adds an "index" column with the index of the row as the _first column_. This column is exempt from being dropped.
 * @param hasMoreDetailsColumn - When true, adds a "more details" column as the _last column_. This column is exempt from being dropped. This column has no header label by default.
 */
export function useColumnPriority<
    TItem extends Item,
    TTableData extends TableItem<TItem>,
>(props: Props<TItem, TTableData>) {
    const {
        columnCountByTableWidth,
        tableContainerRef,
        columns,
        hasItemNumberColumn = true,
        hasMoreDetailsColumn = true,
    } = props;

    const [parentWidth, setParentWidth] = useState(0);

    // Define special columns individually for clarity
    const indexColumn: TableColumn<TItem, TTableData> | undefined = useMemo(
        () =>
            hasItemNumberColumn
                ? {
                      key: 'itemNumber' as keyof TItem & string,
                      label: '#',
                      allowSorting: true,
                      isSpecialColumn: true,
                  }
                : undefined,
        [hasItemNumberColumn],
    );

    const moreDetailsColumn: TableColumn<TItem, TTableData> | undefined =
        useMemo(
            () =>
                hasMoreDetailsColumn
                    ? {
                          key: 'moreDetails' as keyof TItem & string,
                          label: '',
                          isSpecialColumn: true,
                      }
                    : undefined,
            [hasMoreDetailsColumn],
        );

    const [columnsToShow, setColumnsToShow] = useState<
        TableColumn<TItem, TTableData>[]
    >([]);

    const handleResize = useCallback(() => {
        if (tableContainerRef.current?.parentElement) {
            setParentWidth(tableContainerRef.current.parentElement.offsetWidth);
        }
    }, [tableContainerRef]);

    const handleDropColumns = useCallback(() => {
        const columnCount = getColumnCount(
            parentWidth,
            columnCountByTableWidth,
        );
        const dynamicColumnsToShow = columns?.slice(0, columnCount) ?? [];
        // Ensure the index column is first and the "more details" column is last
        setColumnsToShow(
            [indexColumn, ...dynamicColumnsToShow, moreDetailsColumn].filter(
                Boolean,
            ),
        );
    }, [
        parentWidth,
        columns,
        columnCountByTableWidth,
        indexColumn,
        moreDetailsColumn,
    ]);

    useEffect(() => {
        handleResize();
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [handleResize]);

    useEffect(() => {
        handleDropColumns();
    }, [handleDropColumns, parentWidth]);

    return useMemo(() => ({ columnsToShow }) as const, [columnsToShow]);
}

export function getColumnCount(
    parentElementWidth: number,
    columnCountByTableWidth: Record<number, number>,
) {
    let closestKey = 1520;
    let smallestDifference = Infinity;

    Object.keys(columnCountByTableWidth).forEach(columnWidthKey => {
        const columnWidth = parseInt(columnWidthKey);
        const difference = Math.abs(parentElementWidth - columnWidth);

        if (difference < smallestDifference) {
            smallestDifference = difference;
            closestKey = parseInt(columnWidthKey);
        }
    });

    const columnCount = columnCountByTableWidth[closestKey];

    return columnCount;
}
