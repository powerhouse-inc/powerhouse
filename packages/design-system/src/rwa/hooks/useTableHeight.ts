import {
  type MutableRefObject,
  type RefObject,
  useCallback,
  useEffect,
  useState,
} from "react";

type Props = {
  selectedItemNumber: number | undefined;
  tableContainerRef: RefObject<HTMLDivElement>;
  rowRefs: MutableRefObject<(HTMLTableRowElement | null)[]>;
  headerRef: RefObject<HTMLTableSectionElement>;
  hasSpecialLastRow?: boolean;
};

const defaultRowHeight = 34;
const defaultHeaderHeight = 42;
const defaultRowCount = 20;
const defaultTwentyRowsPlusHeaderHeight =
  defaultRowHeight * defaultRowCount + defaultHeaderHeight;

export function useTableHeight(props: Props) {
  const {
    selectedItemNumber,
    tableContainerRef,
    rowRefs,
    headerRef,
    hasSpecialLastRow = false,
  } = props;
  const [maxHeight, setMaxHeight] = useState(
    `${defaultTwentyRowsPlusHeaderHeight}px`,
  );
  const selectedRowNumber = selectedItemNumber
    ? selectedItemNumber - 1 + (hasSpecialLastRow ? 1 : 0)
    : undefined;
  const rowHeight = rowRefs.current[1]?.offsetHeight ?? defaultRowHeight;
  const headerHeight = headerRef.current?.offsetHeight ?? defaultHeaderHeight;

  const updateTableHeight = useCallback(() => {
    if (selectedRowNumber === undefined) {
      const twentyRowsAndHeaderHeight = rowHeight * 20 + headerHeight;
      setMaxHeight(`${twentyRowsAndHeaderHeight}px`);
      return;
    }

    const tableContainerRect =
      tableContainerRef.current?.getBoundingClientRect();
    const rowRect = rowRefs.current[selectedRowNumber]?.getBoundingClientRect();

    if (rowRect && tableContainerRect) {
      const rowBottom = rowRect.bottom;
      const tableTop = tableContainerRect.top;
      const calculatedHeight = rowBottom - tableTop;

      setMaxHeight(`${calculatedHeight}px`);
    }
  }, [headerHeight, rowHeight, rowRefs, selectedRowNumber, tableContainerRef]);

  useEffect(() => {
    updateTableHeight();
  }, [updateTableHeight]);

  useEffect(() => {
    const handleScroll = () => {
      updateTableHeight();
    };

    const tableContainerElement = tableContainerRef.current;

    if (tableContainerElement) {
      tableContainerElement.addEventListener("scroll", handleScroll);
    }

    return () => {
      if (tableContainerElement) {
        tableContainerElement.removeEventListener("scroll", handleScroll);
      }
    };
  }, [tableContainerRef, updateTableHeight]);

  return maxHeight;
}
