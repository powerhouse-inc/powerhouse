import { Sidebar, SidebarPanel } from "#design-system";
import type { HTMLAttributes } from "react";
import type { ConnectSidebarFooterProps } from "./sidebar-footer.js";
import { ConnectSidebarFooter } from "./sidebar-footer.js";
import type { ConnectSidebarHeaderProps } from "./sidebar-header.js";
import { ConnectSidebarHeader } from "./sidebar-header.js";

export interface ConnectSidebarProps
  extends
    HTMLAttributes<HTMLElement>,
    ConnectSidebarHeaderProps,
    ConnectSidebarFooterProps {
  maxWidth?: string;
  minWidth?: string;
  headerContent?: React.ReactNode;
  loadingUser?: boolean;
  onLogin: (() => void) | undefined;
  onDisconnect: (() => void) | undefined;
  etherscanUrl?: string;
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
}

export const ConnectSidebar: React.FC<ConnectSidebarProps> = ({
  onClick,
  address,
  ensName,
  avatarUrl,
  headerContent,
  onClickSettings,
  settingsHref,
  settingsCurrent,
  maxWidth = "304px",
  minWidth = "58px",
  onLogin,
  onDisconnect,
  etherscanUrl,
  showDebug,
  onDebugClick,
  ...props
}) => {
  return (
    // AppLayout makes it a bar under the page on a phone, however it's wrapped.
    <Sidebar
      {...props}
      data-connect-sidebar=""
      maxWidth={maxWidth}
      minWidth={minWidth}
    >
      <SidebarPanel className="max-sm:flex max-sm:overflow-x-auto max-sm:overflow-y-hidden">
        <ConnectSidebarHeader className="max-sm:hidden">
          {headerContent}
        </ConnectSidebarHeader>
        <nav
          aria-label="Drives and pages"
          className="flex flex-col max-sm:flex-row"
        >
          {props.children}
        </nav>
      </SidebarPanel>
      <ConnectSidebarFooter
        address={address}
        ensName={ensName}
        avatarUrl={avatarUrl}
        onClickSettings={onClickSettings}
        settingsHref={settingsHref}
        settingsCurrent={settingsCurrent}
        onLogin={onLogin}
        onDisconnect={onDisconnect}
        etherscanUrl={etherscanUrl}
        onHomeClick={onClick}
        showDebug={showDebug}
        onDebugClick={onDebugClick}
      />
    </Sidebar>
  );
};
