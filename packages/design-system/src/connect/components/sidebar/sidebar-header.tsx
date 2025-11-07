import { twMerge } from "tailwind-merge";
import { Icon } from "../../../powerhouse/components/icon/icon.js";
import type { SidebarHeaderProps } from "../../../powerhouse/components/sidebar/sidebar.js";
import { SidebarHeader } from "../../../powerhouse/components/sidebar/sidebar.js";

export interface ConnectSidebarHeaderProps extends SidebarHeaderProps {
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
}

export const ConnectSidebarHeader: React.FC<ConnectSidebarHeaderProps> = ({
  onClick,
  className,
  children,
  ...props
}) => {
  return (
    <SidebarHeader
      {...props}
      className={twMerge(
        "flex justify-center gap-4 border-b border-gray-300 py-4",
        className,
      )}
    >
      <button
        aria-label="Home"
        className={onClick ? "cursor-pointer" : "cursor-wait"}
        onClick={onClick}
        type="button"
      >
        <Icon className="text-gray-600" name="ConnectSmall" size={24} />
      </button>
    </SidebarHeader>
  );
};
