import { Icon } from "@/powerhouse";
import { SidebarItem } from "./sidebar-item";

type SidebarAddDriveItemProps = {
  readonly containerClassName?: string;
  readonly onClick?: (event: React.MouseEvent<HTMLDivElement>) => void;
};
export const SidebarAddDriveItem = function SidebarAddDriveItem(
  props: SidebarAddDriveItemProps,
) {
  const { containerClassName, onClick } = props;
  return (
    <SidebarItem
      title="Create New Drive"
      icon={<Icon name="PlusSquare" size={32} />}
      onClick={onClick}
      containerClassName={containerClassName}
    />
  );
};
