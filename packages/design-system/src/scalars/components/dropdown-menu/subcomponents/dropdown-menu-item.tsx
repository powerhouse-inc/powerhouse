import { Icon, IconName } from "@/powerhouse";
import {
  DropdownItem,
  DropdownShortcut,
} from "../../fragments/dropdown-menu/dropdown-menu";
import { cloneElement, ReactElement } from "react";
import { cn } from "@/scalars/lib/utils";

interface ExportMenuItemProps
  extends React.ComponentProps<typeof DropdownItem> {
  icon?: IconName | ReactElement;
  label: string;
  shortcut?: string;
  className?: string;
  downloadFileHandler?: () => void;
}

const DropdownMenuItem = ({
  icon,
  label,
  shortcut,
  downloadFileHandler,
  className,
  ...props
}: ExportMenuItemProps) => {
  return (
    <DropdownItem
      {...props}
      onClick={downloadFileHandler}
      className={cn(className, "cursor-pointer")}
    >
      {icon &&
        (typeof icon === "string" ? (
          <Icon name={icon} />
        ) : (
          cloneElement(icon, { className: "min-w-4 w-4" })
        ))}
      <span className="text-gray-700 font-normal text-[14px] leading-[20px]">
        {label}
      </span>
      {shortcut && <DropdownShortcut>{shortcut}</DropdownShortcut>}
    </DropdownItem>
  );
};

export default DropdownMenuItem;
