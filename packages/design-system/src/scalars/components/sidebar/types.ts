import { IconName } from "@/powerhouse";

export type SidebarNode = {
  title: string;
  id: string;
  children?: SidebarNode[];
  icon?: IconName;
  expandedIcon?: IconName;
};

export interface FlattenedNode extends SidebarNode {
  depth: number;
  isExpanded: boolean;
}
