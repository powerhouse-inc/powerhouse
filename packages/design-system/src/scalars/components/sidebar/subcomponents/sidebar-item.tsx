import { Icon } from "@/index";

export interface SidebarItemProps {
  title: string;
}

export const SidebarItem: React.FC<SidebarItemProps> = ({ title }) => {
  return (
    <div className="flex items-center gap-2 rounded-md px-2 py-1.5 text-gray-900 hover:bg-gray-100">
      <Icon name="ChevronDown" size={16} className="-rotate-90" />
      <Icon name="File" size={16} />
      <div className="text-sm leading-5">{title}</div>
    </div>
  );
};
