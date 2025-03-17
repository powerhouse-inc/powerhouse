import { Icon, SidebarFooter, type SidebarFooterProps } from "#powerhouse";
import { twMerge } from "tailwind-merge";
import { SidebarLogin } from "./sidebar-login.js";
import { SidebarUser } from "./sidebar-user.js";

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
      className={twMerge(
        "flex flex-col gap-2 border-t border-gray-300 px-2 py-4",
        className,
      )}
    >
      <div className="">
        {address ? (
          <SidebarUser address={address} />
        ) : (
          <SidebarLogin onLogin={onLogin} />
        )}
      </div>
      <button
        className="mt-3 flex w-full cursor-pointer items-center justify-center outline-none"
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
