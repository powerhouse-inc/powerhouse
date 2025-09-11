import connectConfig from "#connect-config";
import { useShowAddDriveModal } from "#hooks";
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
  useSelectedDrive,
  useSelectedFolder,
} from "@powerhousedao/reactor-browser";
import type { DocumentDriveDocument } from "document-drive";
import { DocumentEditorContainer } from "../components/document-editor-container.js";
import { DriveEditorContainer } from "../components/drive-editor-container.js";
import { DriveIcon } from "../components/drive-icon.js";

export default function Content() {
  const [selectedDrive] = useSelectedDrive();
  const selectedFolder = useSelectedFolder();
  const [selectedDocument] = useSelectedDocument();
  return (
    <ContentContainer>
      {selectedDocument && <DocumentEditorContainer />}
      {(!!selectedDrive || !!selectedFolder) && !selectedDocument && (
        <DriveEditorContainer />
      )}
      {!selectedDocument && !selectedDrive && <HomeScreenContainer />}
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
  const showAddDriveModal = useShowAddDriveModal();
  const config = connectConfig;

  return (
    <HomeScreen>
      {drives?.map((drive) => {
        return <DriveItem key={drive.header.id} drive={drive} />;
      })}
      {config.drives.addDriveEnabled && (
        <HomeScreenAddDriveItem onClick={showAddDriveModal} />
      )}
    </HomeScreen>
  );
}
