import { RefObject, useEffect, useState } from 'react';

type Props = {
    selectedRowNumber: number | undefined;
    tableRef: RefObject<HTMLTableElement>;
    hasSpecialFirstRow?: boolean;
};
export function useTableHeight(props: Props) {
    const { selectedRowNumber, tableRef, hasSpecialFirstRow = false } = props;
    const [maxHeight, setMaxHeight] = useState('max-content');
    const rowHeight = 34;
    const headerHeight = 42;

    useEffect(() => {
        if (!tableRef.current) return;

        if (selectedRowNumber === undefined) {
            setMaxHeight('max-content');
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
