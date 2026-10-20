import { DangerZone as BaseDangerZone } from "@powerhousedao/design-system/connect";
import {
  deleteDrive,
  showPHModal,
  useDrives,
} from "@powerhousedao/reactor-browser";
import type { DocumentDriveDocument } from "@powerhousedao/shared/document-drive";
import { useForgetSettingsOpenedFrom } from "@powerhousedao/connect-core/router";

export const DangerZone: React.FC = () => {
  const drives = useDrives();
  const forgetOpenedFrom = useForgetSettingsOpenedFrom();

  const handleDeleteDrive = async (drive: DocumentDriveDocument) => {
    // Settings selects no drive; deselecting would navigate home.
    await deleteDrive(drive.header.id);
    // Settings may have been opened from the deleted drive.
    await forgetOpenedFrom();
  };

  const handleClearStorage = () => {
    showPHModal({ type: "clearStorage" });
  };

  return (
    <BaseDangerZone
      drives={drives ?? []}
      onDeleteDrive={(drive) => {
        void handleDeleteDrive(drive);
      }}
      onClearStorage={handleClearStorage}
    />
  );
};
