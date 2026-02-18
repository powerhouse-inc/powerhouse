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
const ExportDocumentWithErrorsModal = lazy(() =>
  import("./modals/ExportDocumentWithErrorsModal.js").then((m) => ({
    default: m.ExportDocumentWithErrorsModal,
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
  exportDocumentWithErrors: ExportDocumentWithErrorsModal,
  inspector: InspectorModal,
  settings: SettingsModal,
  upgradeDrive: UpgradeDriveModal,
} as const;

export const ModalsContainer = lazy(async () => {
  const { usePHModal } = await import("@powerhousedao/reactor-browser");
  return {
    default: () => {
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
  };
});
