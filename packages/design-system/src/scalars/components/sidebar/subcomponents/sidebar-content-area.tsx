import { SidebarItem } from "./sidebar-item";
import { useSidebar } from "./sidebar-provider";

export const SidebarContentArea = () => {
  const { state } = useSidebar();
  const items =
    state.pinnedItems.length > 0
      ? (state.pinnedItems[state.pinnedItems.length - 1].childrens ?? [])
      : state.items;

  return (
    <div className="flex flex-col gap-1 p-2">
      {items.map((item) => (
        <SidebarItem
          key={item.id}
          id={item.id}
          title={item.title}
          childrens={item.childrens}
        />
      ))}
    </div>
  );
};
