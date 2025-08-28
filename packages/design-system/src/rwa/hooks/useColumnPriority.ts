import {
  type ColumnCountByTableWidth,
  type TableColumn,
} from "@powerhousedao/design-system";
import { useCallback, useEffect, useMemo, useState } from "react";

type Props<TColumn extends TableColumn> = {
  columns: TColumn[] | undefined;
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
export function useColumnPriority<TColumn extends TableColumn>(
  props: Props<TColumn>,
) {
  const {
    columnCountByTableWidth,
    tableContainerRef,
    columns,
    hasItemNumberColumn = true,
    hasMoreDetailsColumn = true,
  } = props;

  const [parentWidth, setParentWidth] = useState(0);

  // Define special columns individually for clarity
  const indexColumn = useMemo(
    () =>
      hasItemNumberColumn
        ? {
            key: "itemNumber" as const,
            label: "#",
            allowSorting: true,
            isSpecialColumn: true,
          }
        : undefined,
    [hasItemNumberColumn],
  );

  const moreDetailsColumn = useMemo(
    () =>
      hasMoreDetailsColumn
        ? {
            key: "moreDetails" as const,
            label: "",
            isSpecialColumn: true,
          }
        : undefined,
    [hasMoreDetailsColumn],
  );

  const [columnsToShow, setColumnsToShow] = useState<TColumn[]>([]);

  const handleResize = useCallback(() => {
    if (tableContainerRef.current?.parentElement) {
      setParentWidth(tableContainerRef.current.parentElement.offsetWidth);
    }
  }, [tableContainerRef]);

  const handleDropColumns = useCallback(() => {
    const columnCount = getColumnCount(parentWidth, columnCountByTableWidth);
    const dynamicColumnsToShow = columns?.slice(0, columnCount) ?? [];
    // Ensure the index column is first and the "more details" column is last
    setColumnsToShow(
      [indexColumn, ...dynamicColumnsToShow, moreDetailsColumn].filter(
        Boolean,
      ) as TColumn[],
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
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [handleResize]);

  useEffect(() => {
    handleDropColumns();
  }, [handleDropColumns, parentWidth]);

  return useMemo(() => columnsToShow, [columnsToShow]);
}

export function getColumnCount(
  parentElementWidth: number,
  columnCountByTableWidth: Record<number, number>,
) {
  let closestKey = 1520;
  let smallestDifference = Infinity;

  Object.keys(columnCountByTableWidth).forEach((columnWidthKey) => {
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
