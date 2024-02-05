import { orderBy } from 'natural-orderby';
import { ReactNode, useCallback, useMemo, useState } from 'react';
import { SortDescriptor } from 'react-aria-components';

/**
 * Takes a list of items and returns a sorted list of items and a sort descriptor.
 * @param items - The list of items to sort.
 * @returns An object containing the sorted items, a sort descriptor, and a callback to update the sort descriptor.
 */
export function useSortTableItems<TItem extends Record<string, ReactNode>>(
    items: TItem[],
) {
    const [sortDescriptor, setSortDescriptor] = useState<SortDescriptor>({
        column: 'index',
        direction: 'ascending',
    });

    const onSortChange = useCallback((sortDescriptor: SortDescriptor) => {
        setSortDescriptor(sortDescriptor);
    }, []);

    const sortedItems = useMemo(() => {
        const order = sortDescriptor.direction === 'ascending' ? 'asc' : 'desc';
        if (!sortDescriptor.column) {
            console.warn('sortDescriptor.column is undefined');
            return items;
        }
        return orderBy(items, [sortDescriptor.column], [order]);
    }, [sortDescriptor, items]);

    return useMemo(
        () => ({
            sortedItems,
            onSortChange,
            sortDescriptor,
        }),
        [onSortChange, sortDescriptor, sortedItems],
    );
}
