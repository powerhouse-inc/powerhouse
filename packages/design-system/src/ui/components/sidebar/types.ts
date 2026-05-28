import type { IconName } from "../../../powerhouse/types.js";

export enum NodeStatus {
  CREATED = "CREATED",
  MODIFIED = "MODIFIED",
  REMOVED = "REMOVED",
  MOVED = "MOVED",
  DUPLICATED = "DUPLICATED",
  UNCHANGED = "UNCHANGED", // default
}

export type SidebarIcon = IconName | React.ReactElement;

export interface SidebarNode {
  title: string;
  id: string;
  children?: SidebarNode[];
  icon?: SidebarIcon;
  expandedIcon?: SidebarIcon;
  status?: NodeStatus;
  className?: string;
}

export type NodeSortComparisonFn = (
  valueA: string,
  valueB: string,
) => -1 | 0 | 1;
export type NodeSortType = "alphabetical" | "natural" | NodeSortComparisonFn;
export type NodeSortOrder = "asc" | "desc";

export interface FlattenedNode extends SidebarNode {
  depth: number;
  isExpanded: boolean;
}
