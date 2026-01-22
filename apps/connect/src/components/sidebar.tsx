import { DriveIcon } from "@powerhousedao/connect/components";
import { connectConfig } from "@powerhousedao/connect/config";
import {
  ConnectSidebar,
  ConnectTooltipProvider,
  SidebarAddDriveItem,
  SidebarItem,
} from "@powerhousedao/design-system/connect";

import {
  logout,
  openRenown,
  setSelectedDrive,
  showPHModal,
  useDrives,
  useInspectorEnabled,
  useSelectedDriveSafe,
} from "@powerhousedao/reactor-browser";
import { useUser } from "@powerhousedao/reactor-browser/connect";
import { ErrorBoundary } from "./error-boundary.js";

export function Sidebar() {
  const user = useUser();
  const drives = useDrives();
  const [selectedDrive] = useSelectedDriveSafe();
  const inspectorEnabled = useInspectorEnabled();
  const connectDebug = localStorage.getItem("CONNECT_DEBUG") === "true";

  const onClickSettings = () => {
    showPHModal({ type: "settings" });
  };

  const onAddDriveClick = () => {
    showPHModal({ type: "addDrive" });
  };

  const onInspectorClick = () => {
    showPHModal({ type: "inspector" });
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
        onInspectorClick={inspectorEnabled ? onInspectorClick : undefined}
        address={user?.address}
        onLogin={openRenown}
        onDisconnect={logout}
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
          {connectConfig.drives.addDriveEnabled && (
            <SidebarAddDriveItem onClick={onAddDriveClick} />
          )}
        </ErrorBoundary>
      </ConnectSidebar>
    </ConnectTooltipProvider>
  );
}
