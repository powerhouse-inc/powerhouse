import { type Item, type TableItem } from "@/rwa";
import { type Identifier, type Order, orderBy } from "natural-orderby";
import { useCallback, useEffect, useMemo, useState } from "react";

/**
 * Takes a list of items and returns a sorted list of items and a sort descriptor.
 * @param items - The list of items to sort.
 * @returns An object containing the sorted items and a sort handler func
 */
export function useSortTableItems<
  TItem extends Item,
  TTableData extends TableItem<TItem>,
>(items: TTableData[] | undefined) {
  const [sortedItems, setSortedItems] = useState(items);
  const [column, setColumn] = useState<Identifier<TTableData>>();
  const [direction, setDirection] = useState<Order>("asc");

  const sortHandler = useCallback(
    (column: Identifier<TTableData>, direction: Order) => {
      setColumn(column);
      setDirection(direction);
    },
    [],
  );

  useEffect(() => {
    if (!items) return;

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
