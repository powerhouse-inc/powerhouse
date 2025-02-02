import { IconName } from "@/powerhouse";

export type SidebarNode = {
  title: string;
  id: string;
  children?: SidebarNode[];
  icon?: IconName;
  expandedIcon?: IconName;
};
