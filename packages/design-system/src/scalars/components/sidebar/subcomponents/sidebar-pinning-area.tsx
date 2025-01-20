import { Item } from "./sidebar-item";
import { useSidebar } from "./sidebar-provider";

export const SidebarPinningArea = () => {
  const { state } = useSidebar();

  return (
    <div className="flex flex-col gap-1 border-b border-gray-300 bg-gray-100 px-2 pb-0.5 pt-2">
      {state.pinnedItems.map((node) => (
        <Item
          key={node.id}
          id={node.id}
          title={node.title}
          pinnedMode={true}
          allowPinning={true}
        />
      ))}
    </div>
  );
};
