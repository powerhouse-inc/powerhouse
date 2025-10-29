import {
  HomeScreen,
  HomeScreenAddDriveItem,
  HomeScreenItem,
} from "@powerhousedao/design-system";
import {
  setSelectedDrive,
  useDriveEditorModuleById,
  useDrives,
} from "@powerhousedao/reactor-browser";
import type { DocumentDriveDocument } from "document-drive";
import { DriveIcon } from "../components/drive-icon.js";
import { connectConfig } from "../connect.config.js";

export function HomePage() {
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
