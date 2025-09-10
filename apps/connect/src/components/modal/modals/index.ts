import { lazy } from "react";

export const modals = {
  deleteItem: lazy(() =>
    import("./DeleteItemModal.js").then((m) => ({
      default: m.DeleteItemModal,
    })),
  ),
  upgradeDrive: lazy(() =>
    import("./UpgradeDriveModal.js").then((m) => ({
      default: m.UpgradeDriveModal,
    })),
  ),
  createDocument: lazy(() =>
    import("./CreateDocumentModal.js").then((m) => ({
      default: m.CreateDocumentModal,
    })),
  ),
  addDriveModal: lazy(() =>
    import("./AddDriveModal.js").then((m) => ({
      default: m.AddDriveModal,
    })),
  ),
  addLocalDrive: lazy(() =>
    import("./AddLocalDriveModal.js").then((m) => ({
      default: m.AddLocalDriveModal,
    })),
  ),
  addRemoteDrive: lazy(() =>
    import("./AddRemoteDriveModal.js").then((m) => ({
      default: m.AddRemoteDriveModal,
    })),
  ),
  driveSettings: lazy(() =>
    import("./DriveSettingsModal.js").then((m) => ({
      default: m.DriveSettingsModal,
    })),
  ),
  settingsModal: lazy(() =>
    import("./SettingsModal.js").then((m) => ({
      default: m.SettingsModal,
    })),
  ),
  confirmationModal: lazy(() =>
    import("./ConfirmationModal.js").then((m) => ({
      default: m.ConfirmationModal,
    })),
  ),
  deleteDriveModal: lazy(() =>
    import("./DeleteDriveModal.js").then((m) => ({
      default: m.DeleteDriveModal,
    })),
  ),
  debugSettingsModal: lazy(() =>
    import("./DebugSettingsModal.js").then((m) => ({
      default: m.DebugSettingsModal,
    })),
  ),
  disclaimerModal: lazy(() =>
    import("./DisclaimerModal.js").then((m) => ({
      default: m.DisclaimerModal,
    })),
  ),
  cookiesPolicy: lazy(() =>
    import("./CookiesPolicyModal.js").then((m) => ({
      default: m.CookiesPolicyModal,
    })),
  ),
} as const;

export type Modals = typeof modals;

export type ModalType = keyof Modals;

export type ModalPropsMapping = {
  [K in ModalType]: React.ComponentProps<Modals[K]>;
};
