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
  setSelectedDrive,
  showPHModal,
  useIsAddDriveEnabled,
  useDrives,
  useSelectedDriveSafe,
  useUser,
} from "@powerhousedao/reactor-browser";
import { ErrorBoundary } from "./error-boundary.js";

export function Sidebar() {
  const user = useUser();
  const drives = useDrives();
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
        onLogin={() => showPHModal({ type: "login" })}
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
          {drives?.map((drive, index) => (
            <SidebarItem
              key={index}
              title={drive.header.name}
              onClick={() => setSelectedDrive(drive)}
              active={selectedDrive?.header.id === drive.header.id}
              icon={<DriveIcon drive={drive} />}
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
