import { Identifier, orderBy } from 'natural-orderby';
import { ReactNode, useState } from 'react';
import { RWATableProps } from './table';

/**
 * Takes a list of items and returns a sorted list of items and a sort descriptor.
 * @param items - The list of items to sort.
 * @returns An object containing the sorted items and a sort handler func
 */
export function useSortTableItems<TItem extends Record<string, ReactNode>>(
    items: TItem[],
) {
    const [sortedItems, setSortedItems] = useState<TItem[]>(items);

    const sortHandler: RWATableProps<TItem>['onClickSort'] = (
        column,
        direction,
    ) => {
        setSortedItems(
            orderBy(sortedItems, [column as Identifier<TItem>], [direction]),
        );
    };

    return { sortedItems, sortHandler };
}
