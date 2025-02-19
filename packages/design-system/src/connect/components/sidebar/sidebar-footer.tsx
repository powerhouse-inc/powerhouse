import { Icon, SidebarFooter, SidebarFooterProps } from "@/powerhouse";
import { twMerge } from "tailwind-merge";
import { SidebarLogin } from "./sidebar-login";
import { SidebarUser } from "./sidebar-user";

export interface ConnectSidebarFooterProps extends SidebarFooterProps {
  address: `0x${string}` | undefined;
  onClickSettings?: () => void;
  onLogin: () => void;
}

export const ConnectSidebarFooter: React.FC<ConnectSidebarFooterProps> = ({
  address,
  className,
  onLogin,
  onClickSettings,
  ...props
}) => {
  return (
    <SidebarFooter
      {...props}
      className={twMerge("border-t border-gray-300 p-4 px-1", className)}
    >
      <div className="">
        {address ? (
          <SidebarUser address={address} />
        ) : (
          <SidebarLogin onLogin={onLogin} />
        )}
      </div>
      <button
        className="mt-3 flex w-full cursor-pointer gap-3 px-3 outline-none"
        onClick={onClickSettings}
      >
        <Icon className="text-gray-600" name="Settings" />
        <span className="hidden text-sm font-semibold leading-6 text-gray-800">
          Settings
        </span>
      </button>
    </SidebarFooter>
  );
};
