export type SidebarNode = {
  title: string;
  id: string;
  childrens?: SidebarNode[];
  icon?: string;
  expanded?: boolean;
};
