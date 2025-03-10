import { Sidebar, SidebarPanel, type SidebarProps } from "@/powerhouse";
import {
  ConnectSidebarFooter,
  type ConnectSidebarFooterProps,
} from "./sidebar-footer";
import {
  ConnectSidebarHeader,
  type ConnectSidebarHeaderProps,
} from "./sidebar-header";

export interface ConnectSidebarProps
  extends Omit<SidebarProps, "maxWidth" | "minWidth">,
    ConnectSidebarHeaderProps,
    ConnectSidebarFooterProps {
  maxWidth?: string;
  minWidth?: string;
  headerContent?: React.ReactNode;
  loadingUser?: boolean;
  onLogin: () => void;
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
      />
    </Sidebar>
  );
};
