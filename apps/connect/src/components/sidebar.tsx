import {
  ConnectSidebar,
  ConnectTooltipProvider,
  SidebarAddDriveItem,
  SidebarItem,
  useEns,
} from "@powerhousedao/design-system/connect";

import {
  isPlainClick,
  logout,
  makeDriveSlug,
  preloadDrive,
  setSelectedDrive,
  showPHModal,
  useIsAddDriveEnabled,
  useLinkProps,
  useSelectedDriveSafe,
  useUser,
} from "@powerhousedao/reactor-browser";
import type { DocumentDriveDocument } from "@powerhousedao/shared/document-drive";
import type { AnyRouter } from "@tanstack/react-router";
import { useRouter, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useOpenRenownLogin } from "../hooks/use-renown-login.js";
import type { NavRouteEntry } from "../router/sidebar.js";
import { useNavRoutes } from "../router/sidebar.js";
import { DriveIcon } from "./drive-icon.js";
import { ErrorBoundary } from "./error-boundary.js";
import { useVisibleDrives } from "./use-drive-auth-gate.js";

function DriveSidebarItem(props: {
  drive: DocumentDriveDocument;
  active: boolean;
}) {
  const { drive, active } = props;
  const link = useLinkProps({ driveSlug: makeDriveSlug(drive) }, () =>
    setSelectedDrive(drive),
  );
  return (
    <SidebarItem
      title={drive.header.name}
      href={link.href}
      aria-current={link["aria-current"]}
      onClick={link.onClick}
      onPreload={() => preloadDrive(drive)}
      active={active}
      icon={<DriveIcon drive={drive} />}
    />
  );
}

/** The drives the user may open, and the add-drive item when enabled. */
export function SidebarDriveItems() {
  const drives = useVisibleDrives();
  const isAddDriveEnabled = useIsAddDriveEnabled();
  const [selectedDrive] = useSelectedDriveSafe();
  return (
    <>
      {drives?.map((drive) => (
        <DriveSidebarItem
          key={drive.header.id}
          drive={drive}
          active={selectedDrive?.header.id === drive.header.id}
        />
      ))}
      {isAddDriveEnabled && (
        <SidebarAddDriveItem
          onClick={() => showPHModal({ type: "addDrive" })}
        />
      )}
    </>
  );
}

function NavSidebarItem({ item }: { item: NavRouteEntry }) {
  // Nav routes can come from a project's tree, unknown to Connect's types.
  const router = useRouter() as unknown as AnyRouter;
  // A boolean select: loading state changes don't re-render the item.
  const current = useRouterState({
    select: () => !!router.matchRoute({ to: item.to }, { fuzzy: true }),
  });
  const Icon = item.icon;
  return (
    <SidebarItem
      title={item.label}
      href={router.buildLocation({ to: item.to }).publicHref}
      aria-current={current ? "page" : undefined}
      onClick={(event) => {
        if (!isPlainClick(event)) return;
        event.preventDefault();
        void router.navigate({ to: item.to });
      }}
      onPreload={() => {
        router.preloadRoute({ to: item.to }).catch(() => undefined);
      }}
      icon={Icon ? <Icon size={24} /> : undefined}
    />
  );
}

/** Links to the routes that declare `staticData.nav`, in order. */
export function SidebarNavItems() {
  const items = useNavRoutes();
  return (
    <>
      {items.map((item) => (
        <NavSidebarItem key={item.routeId} item={item} />
      ))}
    </>
  );
}

export type SidebarProps = {
  /** Items after the drives and nav routes, e.g. a custom layout's links. */
  extraItems?: ReactNode;
  /** Header and footer only, no items. */
  collapsed?: boolean;
};

/** Connect's sidebar: drives, nav routes, settings and the user. */
export function Sidebar({ extraItems, collapsed }: SidebarProps = {}) {
  const user = useUser();
  const openLogin = useOpenRenownLogin();
  const connectDebug = localStorage.getItem("CONNECT_DEBUG") === "true";

  const ensName = user?.ens?.name || user?.profile?.username || undefined;
  const avatarUrl =
    user?.ens?.avatarUrl || user?.profile?.userImage || undefined;

  const ensInfo = useEns(!avatarUrl ? user?.address : undefined);

  const settingsLink = useLinkProps({ settings: true });

  const etherscanUrl = user?.address
    ? `https://etherscan.io/address/${user.address}`
    : "";

  return (
    <ConnectTooltipProvider>
      <ConnectSidebar
        id="sidebar"
        data-collapsed={collapsed ? "" : undefined}
        onClick={() => setSelectedDrive(undefined)}
        onClickSettings={settingsLink.onClick}
        settingsHref={settingsLink.href}
        settingsCurrent={settingsLink["aria-current"]}
        address={user?.address}
        onLogin={openLogin}
        onDisconnect={() => {
          void logout();
        }}
        ensName={ensName || ensInfo.data?.ens}
        avatarUrl={
          avatarUrl ||
          ensInfo.data?.avatar_small ||
          ensInfo.data?.avatar_url ||
          undefined
        }
        etherscanUrl={etherscanUrl}
        showDebug={connectDebug}
        onDebugClick={() => showPHModal({ type: "debugSettings" })}
      >
        {!collapsed && (
          <ErrorBoundary
            variant="text"
            fallbackMessage="There was an error loading drives"
            loggerContext={["Connect", "Sidebar"]}
          >
            <SidebarDriveItems />
            <SidebarNavItems />
            {extraItems}
          </ErrorBoundary>
        )}
      </ConnectSidebar>
    </ConnectTooltipProvider>
  );
}
