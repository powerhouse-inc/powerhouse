import { DangerZone as BaseDangerZone } from "@powerhousedao/design-system/connect/components/modal/settings-modal-v2/danger-zone";
import {
  deleteDrive,
  setSelectedDrive,
  showPHModal,
  useDrives,
} from "@powerhousedao/reactor-browser";
import type { DocumentDriveDocument } from "document-drive";

export const DangerZone: React.FC = () => {
  const drives = useDrives();

  const handleDeleteDrive = async (drive: DocumentDriveDocument) => {
    await deleteDrive(drive.header.id);
    setSelectedDrive(undefined);
  };

  const handleClearStorage = () => {
    showPHModal({ type: "clearStorage" });
  };

  return (
    <BaseDangerZone
      drives={drives ?? []}
      onDeleteDrive={handleDeleteDrive}
      onClearStorage={handleClearStorage}
    />
  );
};
