import { IconName } from "@/powerhouse";

export enum NodeStatus {
  CREATED = "CREATED",
  MODIFIED = "MODIFIED",
  REMOVED = "REMOVED",
  MOVED = "MOVED",
  DUPLICATED = "DUPLICATED",
  UNCHANGED = "UNCHANGED", // default
}

export type SidebarIcon = IconName | React.ReactElement;

export type SidebarNode = {
  title: string;
  id: string;
  children?: SidebarNode[];
  icon?: SidebarIcon;
  expandedIcon?: SidebarIcon;
  status?: NodeStatus;
};

export interface FlattenedNode extends SidebarNode {
  depth: number;
  isExpanded: boolean;
}
