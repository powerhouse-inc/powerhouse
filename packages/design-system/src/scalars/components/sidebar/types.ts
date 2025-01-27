export type SidebarNode = {
  title: string;
  id: string;
  children?: SidebarNode[];
  icon?: string;
  expanded?: boolean;
};
