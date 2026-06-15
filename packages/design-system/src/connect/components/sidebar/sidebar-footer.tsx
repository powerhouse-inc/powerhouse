import { Icon, SidebarFooter } from "#design-system";
import { Settings } from "lucide-react";
import type { ComponentProps } from "react";
import { twMerge } from "tailwind-merge";
import { ThemeSwitch } from "../theme-switch.js";
import { SidebarLogin } from "./sidebar-login.js";
import { SidebarUser } from "./sidebar-user.js";
export interface ConnectSidebarFooterProps extends ComponentProps<
  typeof SidebarFooter
> {
  address: `0x${string}` | undefined;
  ensName?: string;
  avatarUrl?: string;
  onClickSettings: (() => void) | undefined;
  onLogin: (() => void) | undefined;
  etherscanUrl?: string;
  onDisconnect: (() => void) | undefined;
  onHomeClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  showDebug?: boolean;
  onDebugClick?: () => void;
}

export const ConnectSidebarFooter: React.FC<ConnectSidebarFooterProps> = ({
  address,
  ensName,
  avatarUrl,
  className,
  onLogin,
  onClickSettings,
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
        "flex flex-col items-center gap-3 border-t border-sidebar-border px-2 py-4 dark:border-none",
        className,
      )}
    >
      {onHomeClick && (
        <button
          aria-label="Home"
          type="button"
          className="cursor-pointer"
          onClick={onHomeClick}
        >
          <Icon
            className="text-muted-foreground"
            name="ConnectSmall"
            size={24}
          />
        </button>
      )}
      {showDebug && onDebugClick && (
        <button
          aria-label="Debug Settings"
          type="button"
          id="connect-debug-button"
          className="cursor-pointer"
          onClick={onDebugClick}
        >
          <Icon className="text-foreground" name="Tube" />
        </button>
      )}
      <div className={onHomeClick ? "mt-3" : ""}>
        {address ? (
          <SidebarUser
            address={address}
            ensName={ensName}
            avatarUrl={avatarUrl}
            onDisconnect={onDisconnect}
            etherscanUrl={etherscanUrl}
          />
        ) : (
          <SidebarLogin onLogin={onLogin} />
        )}
      </div>
      <button
        aria-label="Settings"
        type="button"
        className={twMerge(onClickSettings ? "cursor-pointer" : "cursor-wait")}
        onClick={onClickSettings}
      >
        <Settings className="text-foreground" size={24} strokeWidth={2} />
        <span className="hidden text-sm/6 font-semibold text-foreground">
          Settings
        </span>
      </button>
      <ThemeSwitch />
    </SidebarFooter>
  );
};
