import type { IStorageUnitFilter, ResolvedStorageUnitFilter } from "./types.js";

export const isValidDocumentId = (id: string) =>
  id && id.length > 0 && /^[a-zA-Z0-9_-]+$/.test(id);

export const isValidSlug = (slug: string) =>
  slug && slug.length > 0 && /^[a-zA-Z0-9_-]+$/.test(slug);

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
