export type Node = {
  title: string;
  id: string;
  childrens?: Node[];
};

export type SidebarNode = {
  title: string;
  id: string;
  childrens?: SidebarNode[];
};
