import { Identifier, Order, orderBy } from 'natural-orderby';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { TableItem } from '..';

/**
 * Takes a list of items and returns a sorted list of items and a sort descriptor.
 * @param items - The list of items to sort.
 * @returns An object containing the sorted items and a sort handler func
 */
export function useSortTableItems<TItem extends TableItem>(items: TItem[]) {
    const [sortedItems, setSortedItems] = useState<TItem[]>(items);
    const [column, setColumn] = useState<Identifier<TItem>>();
    const [direction, setDirection] = useState<Order>('asc');

    const sortHandler = useCallback(
        (column: Identifier<TItem>, direction: Order) => {
            setColumn(column);
            setDirection(direction);
        },
        [],
    );

    useEffect(() => {
        if (!column) {
            setSortedItems(items);
            return;
        }
        setSortedItems(orderBy(items, [column], [direction]));
    }, [column, direction, items, sortHandler]);

    return useMemo(
        () => ({ sortedItems, sortHandler }) as const,
        [sortedItems, sortHandler],
    );
}
