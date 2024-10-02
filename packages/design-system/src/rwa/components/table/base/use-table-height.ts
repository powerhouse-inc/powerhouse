import {
    MutableRefObject,
    RefObject,
    useCallback,
    useEffect,
    useState,
} from 'react';

type Props = {
    selectedRowNumber: number | undefined;
    tableContainerRef: RefObject<HTMLDivElement>;
    rowRefs: MutableRefObject<(HTMLTableRowElement | null)[]>;
    headerRef: RefObject<HTMLTableSectionElement>;
};

const defaultRowHeight = 34;
const defaultHeaderHeight = 42;
const defaultTwentyRowsPlusHeaderHeight =
    defaultRowHeight * 20 + defaultHeaderHeight;

export function useTableHeight(props: Props) {
    const { selectedRowNumber, tableContainerRef, rowRefs, headerRef } = props;
    const [maxHeight, setMaxHeight] = useState(
        `${defaultTwentyRowsPlusHeaderHeight}px`,
    );
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
        const rowRect =
            rowRefs.current[selectedRowNumber]?.getBoundingClientRect();

        if (rowRect && tableContainerRect) {
            const rowBottom = rowRect.bottom;
            const tableTop = tableContainerRect.top;
            const calculatedHeight = rowBottom - tableTop;

            setMaxHeight(`${calculatedHeight}px`);
        }
    }, [
        headerHeight,
        rowHeight,
        rowRefs,
        selectedRowNumber,
        tableContainerRef,
    ]);

    useEffect(() => {
        updateTableHeight();
    }, [updateTableHeight]);

    useEffect(() => {
        const handleScroll = () => {
            updateTableHeight();
        };

        const tableContainerElement = tableContainerRef.current;

        if (tableContainerElement) {
            tableContainerElement.addEventListener('scroll', handleScroll);
        }

        return () => {
            if (tableContainerElement) {
                tableContainerElement.removeEventListener(
                    'scroll',
                    handleScroll,
                );
            }
        };
    }, [tableContainerRef, updateTableHeight]);

    return maxHeight;
}
