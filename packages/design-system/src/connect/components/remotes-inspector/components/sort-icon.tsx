import { Icon } from "@powerhousedao/design-system";
import { type SortDirection } from "../utils.js";

export type SortIconProps = {
  readonly direction: SortDirection;
  readonly active: boolean;
};

export function SortIcon({ direction, active }: SortIconProps) {
  if (!active) {
    return (
      <Icon
        className="opacity-0 group-hover:opacity-50"
        name="CaretSort"
        size={12}
      />
    );
  }

  return (
    <Icon
      className={direction === "asc" ? "rotate-180" : undefined}
      name="TriangleDown"
      size={12}
    />
  );
}
