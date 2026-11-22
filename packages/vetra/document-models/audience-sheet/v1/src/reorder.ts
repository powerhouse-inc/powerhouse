/** Ordering helpers for embedded collections keyed by OID. */

export function insertItem<T extends { id: string }>(
  list: T[],
  item: T,
  insertBefore: string | null,
): void {
  const index =
    insertBefore != null ? list.findIndex((x) => x.id === insertBefore) : -1;
  if (index === -1) {
    list.push(item);
  } else {
    list.splice(index, 0, item);
  }
}

export function reorderById<T extends { id: string }>(
  list: T[],
  ids: readonly string[],
  insertBefore: string | null,
): void {
  const movingIds = new Set(ids);
  const moving = ids
    .map((id) => list.find((item) => item.id === id))
    .filter((item): item is T => item !== undefined);
  const remaining = list.filter((item) => !movingIds.has(item.id));
  const anchorIndex =
    insertBefore != null
      ? remaining.findIndex((item) => item.id === insertBefore)
      : -1;
  const next =
    anchorIndex === -1
      ? [...remaining, ...moving]
      : [
          ...remaining.slice(0, anchorIndex),
          ...moving,
          ...remaining.slice(anchorIndex),
        ];
  list.splice(0, list.length, ...next);
}

export function opportunity(importance: number, satisfaction: number): number {
  return importance + Math.max(0, importance - satisfaction);
}
