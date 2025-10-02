import { DriveEditorContainer, DriveIcon } from "@powerhousedao/connect";
import { connectConfig } from "@powerhousedao/connect/config";
import {
  HomeScreen,
  HomeScreenAddDriveItem,
  HomeScreenItem,
} from "@powerhousedao/design-system";
import {
  setSelectedDrive,
  useDriveEditorModuleById,
  useDrives,
  useSelectedDocument,
  useSelectedDriveSafe,
  useSelectedFolder,
} from "@powerhousedao/reactor-browser";
import type { DocumentDriveDocument } from "document-drive";

export function Content() {
  const [selectedDrive] = useSelectedDriveSafe();
  const selectedFolder = useSelectedFolder();
  const [selectedDocument] = useSelectedDocument();
  const showHomeScreen = !selectedDocument && !selectedDrive && !selectedFolder;
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
