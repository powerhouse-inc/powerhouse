import type { ConnectModals } from "@powerhousedao/connect-core/router";
import { coreModals, ModalOutlet } from "@powerhousedao/connect-core/router";
import { lazy } from "react";
import { genericActive } from "../generic-view.js";

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
const CookiesPolicyModal = lazy(() =>
  import("./modals/CookiesPolicyModal.js").then((m) => ({
    default: m.CookiesPolicyModal,
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
const OpenFileDocumentsModal = lazy(() =>
  import("./modals/OpenFileDocumentsModal.js").then((m) => ({
    default: m.OpenFileDocumentsModal,
  })),
);
const LoginModal = lazy(() =>
  import("./modals/LoginModal.js").then((m) => ({
    default: m.LoginModal,
  })),
);

// Connect's own, with or without the generic plugin: analytics consent and the
// PWA's open-file picker.
const appModals: ConnectModals = {
  cookiesPolicy: CookiesPolicyModal,
  openFileDocuments: OpenFileDocumentsModal,
};

/** The generic plugin's modals: its chrome's, and core's in its style.
 * "settings" is a page; showPHModal navigates to it. */
export const genericModals: ConnectModals = {
  ...appModals,
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

/** The open modal, in the router so a route's `staticData.modals` can replace it:
 * the generic plugin's views, else core's. */
export function ConnectModalOutlet() {
  const modals = genericActive()
    ? genericModals
    : { ...coreModals, ...appModals };
  return <ModalOutlet modals={modals} />;
}
