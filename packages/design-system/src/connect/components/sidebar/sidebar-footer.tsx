import { Icon, SidebarFooter } from "@powerhousedao/design-system";
import type { ComponentProps } from "react";
import { twMerge } from "tailwind-merge";
import { SidebarLogin } from "./sidebar-login.js";
import { SidebarUser } from "./sidebar-user.js";

export interface ConnectSidebarFooterProps extends ComponentProps<
  typeof SidebarFooter
> {
  address: `0x${string}` | undefined;
  onClickSettings: (() => void) | undefined;
  onInspectorClick?: () => void;
  onLogin: (() => void) | undefined;
  etherscanUrl?: string;
  onDisconnect: (() => void) | undefined;
  onHomeClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  showDebug?: boolean;
  onDebugClick?: () => void;
}

export const ConnectSidebarFooter: React.FC<ConnectSidebarFooterProps> = ({
  address,
  className,
  onLogin,
  onClickSettings,
  onInspectorClick,
  onDisconnect,
  onHomeClick,
  showDebug,
  onDebugClick,
  etherscanUrl = "",
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
      {onHomeClick && (
        <button
          aria-label="Home"
          type="button"
          className="flex w-full cursor-pointer items-center justify-center outline-none"
          onClick={onHomeClick}
        >
          <Icon className="text-gray-600" name="ConnectSmall" size={24} />
        </button>
      )}
      {showDebug && onDebugClick && (
        <button
          aria-label="Debug Settings"
          type="button"
          id="connect-debug-button"
          className="mt-3 flex w-full cursor-pointer items-center justify-center outline-none"
          onClick={onDebugClick}
        >
          <Icon className="text-gray-600" name="Tube" />
        </button>
      )}
      <div className={onHomeClick ? "mt-3" : ""}>
        {address ? (
          <SidebarUser
            address={address}
            onDisconnect={onDisconnect}
            etherscanUrl={etherscanUrl}
          />
        ) : (
          <SidebarLogin onLogin={onLogin} />
        )}
      </div>
      {onInspectorClick && (
        <button
          aria-label="Inspector"
          type="button"
          className="mt-3 flex w-full cursor-pointer items-center justify-center outline-none"
          onClick={onInspectorClick}
        >
          <Icon className="text-gray-600" name="CircleInfo" />
        </button>
      )}
      <button
        aria-label="Settings"
        type="button"
        className={twMerge(
          "mt-3 flex w-full items-center justify-center outline-none",
          onClickSettings ? "cursor-pointer" : "cursor-wait",
        )}
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
