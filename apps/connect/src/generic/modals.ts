import type { ConnectModals } from "@powerhousedao/connect-core/router";
import { lazy } from "react";

const AddDriveModal = lazy(() =>
  import("./modals/AddDriveModal.js").then((m) => ({
    default: m.AddDriveModal,
  })),
);
const ClearStorageModal = lazy(() =>
  import("./modals/ClearStorageModal.js").then((m) => ({
    default: m.ClearStorageModal,
  })),
);
const CreateDocumentModal = lazy(() =>
  import("./modals/CreateDocumentModal.js").then((m) => ({
    default: m.CreateDocumentModal,
  })),
);
const DebugSettingsModal = lazy(() =>
  import("./modals/DebugSettingsModal.js").then((m) => ({
    default: m.DebugSettingsModal,
  })),
);
const DeleteDriveModal = lazy(() =>
  import("./modals/DeleteDriveModal.js").then((m) => ({
    default: m.DeleteDriveModal,
  })),
);
const DeleteItemModal = lazy(() =>
  import("./modals/DeleteItemModal.js").then((m) => ({
    default: m.DeleteItemModal,
  })),
);
const DisclaimerModal = lazy(() =>
  import("./modals/DisclaimerModal.js").then((m) => ({
    default: m.DisclaimerModal,
  })),
);
const DriveSettingsModal = lazy(() =>
  import("./modals/DriveSettingsModal.js").then((m) => ({
    default: m.DriveSettingsModal,
  })),
);
const DownloadDocumentWithErrorsModal = lazy(() =>
  import("./modals/DownloadDocumentWithErrorsModal.js").then((m) => ({
    default: m.DownloadDocumentWithErrorsModal,
  })),
);
const DocumentVersionUnsupportedModal = lazy(() =>
  import("./modals/DocumentVersionUnsupportedModal.js").then((m) => ({
    default: m.DocumentVersionUnsupportedModal,
  })),
);
const ConfirmDocumentUpgradeModal = lazy(() =>
  import("./modals/ConfirmDocumentUpgradeModal.js").then((m) => ({
    default: m.ConfirmDocumentUpgradeModal,
  })),
);
const UpgradeDriveModal = lazy(() =>
  import("./modals/UpgradeDriveModal.js").then((m) => ({
    default: m.UpgradeDriveModal,
  })),
);
const InspectorModal = lazy(() =>
  import("./modals/InspectorModal/index.js").then((m) => ({
    default: m.InspectorModal,
  })),
);
const DriveAuthRequiredModal = lazy(() =>
  import("./modals/DriveAuthRequiredModal.js").then((m) => ({
    default: m.DriveAuthRequiredModal,
  })),
);
const LoginModal = lazy(() =>
  import("./modals/LoginModal.js").then((m) => ({
    default: m.LoginModal,
  })),
);

/** The generic plugin's modals: its chrome's, and core's in its style.
 * "settings" is a page; showPHModal navigates to it. */
export const genericModals: ConnectModals = {
  addDrive: AddDriveModal,
  clearStorage: ClearStorageModal,
  createDocument: CreateDocumentModal,
  debugSettings: DebugSettingsModal,
  deleteDrive: DeleteDriveModal,
  deleteItem: DeleteItemModal,
  disclaimer: DisclaimerModal,
  driveSettings: DriveSettingsModal,
  downloadDocumentWithErrors: DownloadDocumentWithErrorsModal,
  documentVersionUnsupported: DocumentVersionUnsupportedModal,
  confirmDocumentUpgrade: ConfirmDocumentUpgradeModal,
  inspector: InspectorModal,
  upgradeDrive: UpgradeDriveModal,
  driveAuthRequired: DriveAuthRequiredModal,
  login: LoginModal,
};
