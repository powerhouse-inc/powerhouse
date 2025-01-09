import { SidebarItem } from "./sidebar-item";
import { useSidebar } from "./sidebar-provider";

export const SidebarContentArea = () => {
  const { state } = useSidebar();
  return (
    <div className="flex flex-col gap-1 p-2">
      {state.items.map((item) => (
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
