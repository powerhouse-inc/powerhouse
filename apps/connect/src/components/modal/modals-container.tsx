import { AddDriveModal } from "./modals/AddDriveModal";
import { ClearStorageModal } from "./modals/ClearStorageModal";
import { CookiesPolicyModal } from "./modals/CookiesPolicyModal";
import { CreateDocumentModal } from "./modals/CreateDocumentModal";
import { DebugSettingsModal } from "./modals/DebugSettingsModal";
import { DeleteDriveModal } from "./modals/DeleteDriveModal";
import { DeleteItemModal } from "./modals/DeleteItemModal";
import { DisclaimerModal } from "./modals/DisclaimerModal";
import { DriveSettingsModal } from "./modals/DriveSettingsModal";
import { ExportDocumentWithErrorsModal } from "./modals/ExportDocumentWithErrorsModal";
import { SettingsModal } from "./modals/SettingsModal";
import { UpgradeDriveModal } from "./modals/UpgradeDriveModal";

export function ModalsContainer() {
  return (
    <>
      <AddDriveModal />
      <ClearStorageModal />
      <CookiesPolicyModal />
      <CreateDocumentModal />
      <DebugSettingsModal />
      <DeleteDriveModal />
      <DeleteItemModal />
      <DisclaimerModal />
      <DriveSettingsModal />
      <ExportDocumentWithErrorsModal />
      <SettingsModal />
      <UpgradeDriveModal />
    </>
  );
}
