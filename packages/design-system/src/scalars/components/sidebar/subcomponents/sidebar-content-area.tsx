import { SidebarItem } from "./sidebar-item";

export const SidebarContentArea = () => {
  return (
    <div className="flex flex-col gap-1 p-2">
      <SidebarItem title="Item 1" />
      <SidebarItem title="Item 2" />
      <SidebarItem title="Item 3" />
    </div>
  );
};
