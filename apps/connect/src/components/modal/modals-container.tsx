import { AddDriveModal } from "./modals/AddDriveModal.js";
import { ClearStorageModal } from "./modals/ClearStorageModal.js";
import { CookiesPolicyModal } from "./modals/CookiesPolicyModal.js";
import { CreateDocumentModal } from "./modals/CreateDocumentModal.js";
import { DebugSettingsModal } from "./modals/DebugSettingsModal.js";
import { DeleteDriveModal } from "./modals/DeleteDriveModal.js";
import { DeleteItemModal } from "./modals/DeleteItemModal.js";
import { DisclaimerModal } from "./modals/DisclaimerModal.js";
import { DriveSettingsModal } from "./modals/DriveSettingsModal.js";
import { ExportDocumentWithErrorsModal } from "./modals/ExportDocumentWithErrorsModal.js";
import { SettingsModal } from "./modals/SettingsModal.js";
import { UpgradeDriveModal } from "./modals/UpgradeDriveModal.js";

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
