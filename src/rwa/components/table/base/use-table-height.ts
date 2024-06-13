import { RefObject, useEffect, useState } from 'react';

type Props = {
    selectedRowNumber: number | undefined;
    tableRef: RefObject<HTMLTableElement>;
    hasSpecialFirstRow?: boolean;
};
export function useTableHeight(props: Props) {
    const { selectedRowNumber, tableRef, hasSpecialFirstRow = false } = props;
    const rowHeight = 34;
    const headerHeight = 42;
    const [maxHeight, setMaxHeight] = useState('unset');

    useEffect(() => {
        if (!tableRef.current) return;

        const twentyRowsAndHeaderHeight = 20 * rowHeight + headerHeight;

        if (selectedRowNumber === undefined || selectedRowNumber > 20) {
            setMaxHeight(twentyRowsAndHeaderHeight + 'px');
            return;
        }

        const maxHeight =
            selectedRowNumber * rowHeight +
            headerHeight +
            (hasSpecialFirstRow ? rowHeight : 0);

        setMaxHeight(maxHeight + 'px');
    }, [selectedRowNumber, tableRef, hasSpecialFirstRow]);

    return maxHeight;
}
