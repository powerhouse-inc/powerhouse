import connectConfig from "#connect-config";
import {
  ConnectSidebar,
  Icon,
  SidebarAddDriveItem,
  SidebarItem,
} from "@powerhousedao/design-system";
import {
  logout,
  openRenown,
  setSelectedDrive,
  showPHModal,
  useDrives,
  useSelectedDrive,
  useUser,
} from "@powerhousedao/reactor-browser";
import { logger } from "document-drive";
import { ErrorBoundary } from "react-error-boundary";
import { DriveIcon } from "./drive-icon.js";

export default function Sidebar() {
  const user = useUser();
  const drives = useDrives();
  const [selectedDrive] = useSelectedDrive();
  const connectDebug = localStorage.getItem("CONNECT_DEBUG") === "true";

  const onClickSettings = () => {
    showPHModal({ type: "settings" });
  };

  const onAddDriveClick = () => {
    showPHModal({ type: "addDrive" });
  };

  const headerContent = (
    <div className="flex h-full items-center">
      <Icon
        name="Connect"
        className="!h-[30px] !w-[100px] cursor-pointer"
        onClick={() => setSelectedDrive(undefined)}
      />
      {connectDebug && (
        <button
          aria-label="Home"
          id="connect-debug-button"
          className="ml-6"
          onClick={() => showPHModal({ type: "debugSettings" })}
        >
          <img src="settings.png" className="h-5 text-gray-600" />
        </button>
      )}
    </div>
  );

  const etherscanUrl = user?.address
    ? `https://etherscan.io/address/${user.address}`
    : "";

  return (
    <ConnectSidebar
      id="sidebar"
      onClick={() => setSelectedDrive(undefined)}
      onClickSettings={onClickSettings}
      headerContent={headerContent}
      address={user?.address}
      onLogin={openRenown}
      onDisconnect={logout}
      etherscanUrl={etherscanUrl}
    >
      <ErrorBoundary
        fallback={
          <div className="text-center">There was an error loading drives</div>
        }
        onError={logger.error}
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
  );
}
