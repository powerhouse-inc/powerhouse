import { usePHModal } from "@powerhousedao/reactor-browser";
import { lazy, Suspense } from "react";
import { ErrorBoundary } from "../error-boundary.js";

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
const SettingsModal = lazy(() =>
  import("./modals/SettingsModal.js").then((m) => ({
    default: m.SettingsModal,
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
const MissingPackageModal = lazy(() =>
  import("./modals/MissingPackageModal.js").then((m) => ({
    default: m.ConnectMissingPackageModal,
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
const modalComponents = {
  addDrive: AddDriveModal,
  clearStorage: ClearStorageModal,
  cookiesPolicy: CookiesPolicyModal,
  createDocument: CreateDocumentModal,
  debugSettings: DebugSettingsModal,
  deleteDrive: DeleteDriveModal,
  deleteItem: DeleteItemModal,
  disclaimer: DisclaimerModal,
  driveSettings: DriveSettingsModal,
  downloadDocumentWithErrors: DownloadDocumentWithErrorsModal,
  inspector: InspectorModal,
  settings: SettingsModal,
  upgradeDrive: UpgradeDriveModal,
  missingPackage: MissingPackageModal,
  driveAuthRequired: DriveAuthRequiredModal,
  openFileDocuments: OpenFileDocumentsModal,
  login: LoginModal,
} as const;

export const ModalsContainer = lazy(() => {
  return Promise.resolve({
    default: () => {
      // eslint-disable-next-line react-hooks/rules-of-hooks
      const phModal = usePHModal();

      if (!phModal?.type) return null;

      const ModalComponent = modalComponents[phModal.type];

      return ModalComponent ? (
        <ErrorBoundary variant="silent" loggerContext={["Connect", "Modals"]}>
          <Suspense fallback={null}>
            <ModalComponent />
          </Suspense>
        </ErrorBoundary>
      ) : null;
    },
  });
});
