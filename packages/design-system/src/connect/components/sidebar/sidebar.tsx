import { Sidebar, SidebarPanel, type SidebarProps } from "#powerhouse";
import {
  ConnectSidebarFooter,
  type ConnectSidebarFooterProps,
} from "./sidebar-footer.js";
import {
  ConnectSidebarHeader,
  type ConnectSidebarHeaderProps,
} from "./sidebar-header.js";

export interface ConnectSidebarProps
  extends Omit<SidebarProps, "maxWidth" | "minWidth">,
    ConnectSidebarHeaderProps,
    ConnectSidebarFooterProps {
  maxWidth?: string;
  minWidth?: string;
  headerContent?: React.ReactNode;
  loadingUser?: boolean;
  onLogin: () => void;
  onDisconnect: () => void;
  etherscanUrl?: string;
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
}

export const ConnectSidebar: React.FC<ConnectSidebarProps> = ({
  onClick,
  address,
  headerContent,
  onClickSettings,
  maxWidth = "304px",
  minWidth = "58px",
  onLogin,
  onDisconnect,
  etherscanUrl,
  ...props
}) => {
  return (
    <Sidebar {...props} maxWidth={maxWidth} minWidth={minWidth}>
      <SidebarPanel>
        <ConnectSidebarHeader onClick={onClick}>
          {headerContent}
        </ConnectSidebarHeader>
        <div className="flex flex-col">{props.children}</div>
      </SidebarPanel>
      <ConnectSidebarFooter
        address={address}
        onClickSettings={onClickSettings}
        onLogin={onLogin}
        onDisconnect={onDisconnect}
        etherscanUrl={etherscanUrl}
      />
    </Sidebar>
  );
};
