import { Icon, IconName } from "@/powerhouse/components/icon";
import {
  Dropdown,
  DropdownMenuContent,
  DropdownTrigger,
} from "../fragments/dropdown-menu/dropdown-menu";
import { cn } from "@/scalars/lib/utils";
import { ReactElement } from "react";
import DropdownMenuItem from "./subcomponents/dropdown-menu-item";

interface DropdownMenuProps {
  options: {
    icon?: IconName | ReactElement;
    label: string;
    downloadFileHandler?: () => void;
    shortcut?: string;
  }[];
  className?: string;
  label?: string;
}

const DropdownMenu: React.FC<DropdownMenuProps> = ({
  options,
  className,
  label,
}) => {
  return (
    <Dropdown>
      <DropdownTrigger
        asChild
        className={cn(
          "border-input bg-background ring-offset-background focus:ring-ring flex w-[280px] cursor-pointer items-center justify-between rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-offset-2",
          className,
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex gap-2">
            <Icon name="DownloadFile" className="size-4" />
            <span>{label}</span>
          </div>
          <Icon
            name="CaretDown"
            size={16}
            className="cursor-pointer text-gray-700 dark:text-gray-400"
          />
        </div>
      </DropdownTrigger>
      <DropdownMenuContent className="w-[280px]">
        {options.map((option) => (
          <DropdownMenuItem
            key={option.label}
            icon={option.icon}
            label={option.label}
            shortcut={option.shortcut}
            downloadFileHandler={option.downloadFileHandler}
          />
        ))}
      </DropdownMenuContent>
    </Dropdown>
  );
};

export default DropdownMenu;
