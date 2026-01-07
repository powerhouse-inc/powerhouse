import {
  DriveEditorContainer,
  DriveIcon,
} from "@powerhousedao/connect/components";
import {
  connectConfig,
  defaultPHDocumentEditorConfig,
  defaultPHDriveEditorConfig,
} from "@powerhousedao/connect/config";
import {
  HomeScreen,
  HomeScreenAddDriveItem,
  HomeScreenItem,
} from "@powerhousedao/design-system/connect";
import {
  setPHDocumentEditorConfig,
  setPHDriveEditorConfig,
  setSelectedDrive,
  useDriveEditorModuleById,
  useDrives,
  useSelectedDocumentId,
  useSelectedDriveSafe,
  useSelectedFolder,
} from "@powerhousedao/reactor-browser";
import type { DocumentDriveDocument } from "document-drive";
import { useEffect } from "react";

export function Content() {
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
      setPHDriveEditorConfig(defaultPHDriveEditorConfig);
    }
  }, [selectedDrive]);

  const showHomeScreen =
    !selectedDocumentId && !selectedDrive && !selectedFolder;
  return (
    <ContentContainer>
      {showHomeScreen ? <HomeScreenContainer /> : <DriveEditorContainer />}
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
  const editorModule = useDriveEditorModuleById(
    drive.header.meta?.preferredEditor,
  );
  const description = editorModule?.name || "Drive Explorer App";
  return (
    <HomeScreenItem
      key={drive.header.id}
      title={drive.state.global.name}
      description={description}
      icon={<DriveIcon drive={drive} />}
      onClick={() => setSelectedDrive(drive)}
    />
  );
}

function HomeScreenContainer() {
  const drives = useDrives();
  const config = connectConfig;
  return (
    <HomeScreen>
      {drives?.map((drive) => {
        return <DriveItem key={drive.header.id} drive={drive} />;
      })}
      {config.drives.addDriveEnabled && <HomeScreenAddDriveItem />}
    </HomeScreen>
  );
}
