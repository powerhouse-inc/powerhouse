export type SortDirection = "asc" | "desc";

export type SortOptions = {
  readonly column: string;
  readonly direction: SortDirection;
};

export type ColumnDef = {
  readonly key: string;
  readonly label: string;
  readonly width?: string;
};

export function truncateId(id: string, maxLength: number = 12): string {
  if (id.length <= maxLength) return id;
  return id.slice(0, maxLength) + "...";
}
