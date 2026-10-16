import { DriveIcon } from "@powerhousedao/connect/components";
import {
  ConnectSidebar,
  ConnectTooltipProvider,
  SidebarAddDriveItem,
  SidebarItem,
  useEns,
} from "@powerhousedao/design-system/connect";

import {
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
import { useOpenRenownLogin } from "../hooks/use-renown-login.js";
import { useVisibleDrives } from "./use-drive-auth-gate.js";
import { ErrorBoundary } from "./error-boundary.js";

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

export function Sidebar() {
  const user = useUser();
  const openLogin = useOpenRenownLogin();
  const drives = useVisibleDrives();
  const isAddDriveEnabled = useIsAddDriveEnabled();
  const [selectedDrive] = useSelectedDriveSafe();
  const connectDebug = localStorage.getItem("CONNECT_DEBUG") === "true";

  const ensName = user?.ens?.name || user?.profile?.username || undefined;
  const avatarUrl =
    user?.ens?.avatarUrl || user?.profile?.userImage || undefined;

  const ensInfo = useEns(!avatarUrl ? user?.address : undefined);

  const onClickSettings = () => {
    showPHModal({ type: "settings" });
  };

  const onAddDriveClick = () => {
    showPHModal({ type: "addDrive" });
  };

  const etherscanUrl = user?.address
    ? `https://etherscan.io/address/${user.address}`
    : "";

  return (
    <ConnectTooltipProvider>
      <ConnectSidebar
        id="sidebar"
        onClick={() => setSelectedDrive(undefined)}
        onClickSettings={onClickSettings}
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
        <ErrorBoundary
          variant="text"
          fallbackMessage="There was an error loading drives"
          loggerContext={["Connect", "Sidebar"]}
        >
          {drives?.map((drive) => (
            <DriveSidebarItem
              key={drive.header.id}
              drive={drive}
              active={selectedDrive?.header.id === drive.header.id}
            />
          ))}
          {isAddDriveEnabled && (
            <SidebarAddDriveItem onClick={onAddDriveClick} />
          )}
        </ErrorBoundary>
      </ConnectSidebar>
    </ConnectTooltipProvider>
  );
}
