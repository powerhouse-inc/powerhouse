import { DangerZone as BaseDangerZone } from "@powerhousedao/design-system";
import {
  deleteDrive,
  setSelectedDrive,
  showPHModal,
  useDrives,
} from "@powerhousedao/reactor-browser";
import type { DocumentDriveDocument } from "document-drive";
import { useTranslation } from "react-i18next";

export const DangerZone: React.FC<{ onRefresh: () => void }> = ({
  onRefresh,
}) => {
  const { t } = useTranslation();
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
