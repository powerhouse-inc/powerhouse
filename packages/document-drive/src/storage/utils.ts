import type {
  IStorageUnitFilter,
  ResolvedStorageUnitFilter,
} from "document-drive";

export const resolveStorageUnitsFilterComponent = (
  component: string[] | undefined,
) => {
  return component && component.length > 0 && !component.includes("*")
    ? new Set(component)
    : null;
};

export const resolveStorageUnitsFilter = (
  filter: IStorageUnitFilter,
): ResolvedStorageUnitFilter => {
  return {
    parentId: resolveStorageUnitsFilterComponent(filter.parentId),
    documentId: resolveStorageUnitsFilterComponent(filter.documentId),
    documentModelType: resolveStorageUnitsFilterComponent(
      filter.documentModelType,
    ),
    scope: resolveStorageUnitsFilterComponent(filter.scope),
    branch: resolveStorageUnitsFilterComponent(filter.branch),
  };
};

export const setUnion = <T>(
  base: Set<T>,
  ...iterables: Iterable<T>[]
): Set<T> => {
  const result = new Set(base);
  for (const iterable of iterables) {
    for (const value of iterable) {
      result.add(value);
    }
  }
  return result;
};

export const setIntersection = <T>(left: Set<T>, right: Set<T>): Set<T> => {
  const result = new Set<T>();
  for (const value of left) {
    if (right.has(value)) {
      result.add(value);
    }
  }
  return result;
};
