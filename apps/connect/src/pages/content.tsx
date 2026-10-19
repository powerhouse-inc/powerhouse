import { AppContainer } from "../components/app-container.js";
import { DriveIcon } from "../components/drive-icon.js";
import { IfPlugin } from "../components/if-plugin.js";
import {
  defaultPHAppConfig,
  defaultPHDocumentEditorConfig,
} from "@powerhousedao/connect/config";
import {
  DriveAuthGate,
  HomeScreen,
  HomeScreenAddDriveItem,
  HomeScreenItem,
} from "@powerhousedao/design-system/connect";
import {
  logout,
  makeDriveSlug,
  preloadDrive,
  setPHAppConfig,
  setPHDocumentEditorConfig,
  setSelectedDrive,
  useAppModuleById,
  useIsAddDriveEnabled,
  useLinkProps,
  useSelectedDocumentId,
  useSelectedDriveSafe,
  useSelectedFolder,
  getDriveName,
} from "@powerhousedao/reactor-browser";
import type { DocumentDriveDocument } from "@powerhousedao/shared/document-drive";
import { Outlet } from "@tanstack/react-router";
import { useEffect } from "react";
import { getRuntimeConfig } from "../runtime-config.js";
import { CONTENT_VIEW_ID } from "../router/connect-router.js";
import { useShowsHomeScreen } from "../components/route-views.js";
import {
  useDriveAuthGate,
  useVisibleDrives,
} from "../components/use-drive-auth-gate.js";
import { useOpenRenownLogin } from "../hooks/use-renown-login.js";

export function Content() {
  const { gate, dismiss } = useDriveAuthGate();
  const openLogin = useOpenRenownLogin();
  const [selectedDrive] = useSelectedDriveSafe();
  const selectedFolder = useSelectedFolder();
  const selectedDocumentId = useSelectedDocumentId();

  useEffect(() => {
    if (!selectedDocumentId) {
      setPHDocumentEditorConfig(defaultPHDocumentEditorConfig);
    }
  }, [selectedDocumentId]);

  useEffect(() => {
    if (!selectedDrive) {
      setPHAppConfig(defaultPHAppConfig);
    }
  }, [selectedDrive]);

  const hasSelection = !!(
    selectedDocumentId ||
    selectedDrive ||
    selectedFolder
  );
  const showHomeScreen = useShowsHomeScreen(hasSelection);
  return (
    <ContentContainer>
      <Outlet />
      {gate ? (
        <div className="flex h-full items-center justify-center p-4">
          <DriveAuthGate
            mode={gate}
            onLogin={openLogin}
            onLogout={() => void logout()}
            onClose={dismiss}
          />
        </div>
      ) : showHomeScreen ? (
        // The home screen is generic-shell chrome (the drive-list landing +
        // add-drive). R3 gate: only when the generic plugin is composed in.
        // Absent → no generic landing (a headless/custom shell renders its own
        // or routes straight to a drive). Classic (no composition) = active.
        <IfPlugin module="@powerhousedao/connect/plugins/generic">
          <HomeScreenContainer />
        </IfPlugin>
      ) : hasSelection ? (
        <AppContainer />
      ) : null}
    </ContentContainer>
  );
}

function ContentContainer({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="flex h-full flex-col overflow-auto"
      id={CONTENT_VIEW_ID}
      data-scroll-restoration-id={CONTENT_VIEW_ID}
    >
      {children}
    </div>
  );
}

function DriveItem({ drive }: { drive: DocumentDriveDocument }) {
  const editorModule = useAppModuleById(drive.header.meta?.preferredEditor);
  const description = editorModule?.config.name || "Drive Explorer App";
  const link = useLinkProps({ driveSlug: makeDriveSlug(drive) }, () =>
    setSelectedDrive(drive),
  );
  return (
    <HomeScreenItem
      key={drive.header.id}
      title={getDriveName(drive)}
      description={description}
      icon={<DriveIcon drive={drive} />}
      href={link.href}
      aria-current={link["aria-current"]}
      onClick={link.onClick}
      onPreload={() => preloadDrive(drive)}
    />
  );
}

function HomeScreenContainer() {
  const drives = useVisibleDrives();
  const isAddDriveEnabled = useIsAddDriveEnabled();
  const runtimeConfig = getRuntimeConfig();
  const homeBackground = runtimeConfig.connect.home?.background;
  return (
    <HomeScreen homeBackground={homeBackground}>
      {drives?.map((drive) => {
        return <DriveItem key={drive.header.id} drive={drive} />;
      })}
      {isAddDriveEnabled && <HomeScreenAddDriveItem />}
    </HomeScreen>
  );
}
