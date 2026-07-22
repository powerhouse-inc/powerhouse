import { AppContainer, DriveIcon } from "@powerhousedao/connect/components";
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
  setPHAppConfig,
  setPHDocumentEditorConfig,
  setSelectedDrive,
  showPHModal,
  useAppModuleById,
  useDrives,
  useIsAddDriveEnabled,
  useSelectedDocumentId,
  useSelectedDriveSafe,
  useSelectedFolder,
} from "@powerhousedao/reactor-browser";
import type { DocumentDriveDocument } from "@powerhousedao/shared/document-drive";
import { useEffect } from "react";
import { getRuntimeConfig } from "../runtime-config.js";
import { useDriveAuthGate } from "../components/use-drive-auth-gate.js";

export function Content() {
  const { gate } = useDriveAuthGate();
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

  const showHomeScreen =
    !selectedDocumentId && !selectedDrive && !selectedFolder;
  return (
    <ContentContainer>
      {gate ? (
        <div className="flex h-full items-center justify-center p-4">
          <DriveAuthGate
            mode={gate}
            onLogin={() => showPHModal({ type: "login" })}
            onLogout={() => void logout()}
          />
        </div>
      ) : showHomeScreen ? (
        <HomeScreenContainer />
      ) : (
        <AppContainer />
      )}
    </ContentContainer>
  );
}

function ContentContainer({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full flex-col overflow-auto" id="content-view">
      {children}
    </div>
  );
}

function DriveItem({ drive }: { drive: DocumentDriveDocument }) {
  const editorModule = useAppModuleById(drive.header.meta?.preferredEditor);
  const description = editorModule?.config.name || "Drive Explorer App";
  return (
    <HomeScreenItem
      key={drive.header.id}
      title={drive.state.global.name || drive.header.name}
      description={description}
      icon={<DriveIcon drive={drive} />}
      onClick={() => setSelectedDrive(drive)}
    />
  );
}

function HomeScreenContainer() {
  const drives = useDrives();
  const isAddDriveEnabled = useIsAddDriveEnabled();
  const runtimeConfig = getRuntimeConfig();
  const homeBackground = runtimeConfig.connect?.branding?.homeBackground;
  return (
    <HomeScreen homeBackground={homeBackground}>
      {drives?.map((drive) => {
        return <DriveItem key={drive.header.id} drive={drive} />;
      })}
      {isAddDriveEnabled && <HomeScreenAddDriveItem />}
    </HomeScreen>
  );
}
