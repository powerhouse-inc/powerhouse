// Core's plain views; a host loads them only when it shows them.
export { DocumentView, DriveLayout, NodeView } from "./content.js";
export { DirectoryListing } from "./directory-listing.js";
export { DocumentHistory, HISTORY_PAGE_SIZE } from "./document-history.js";
export { DocumentJson } from "./document-json.js";
export { EditorHost } from "./editor-host.js";
export type { DocumentEditorProps, EditorHostProps } from "./editor-host.js";
export { DriveIndex } from "./home.js";
export { formatModified } from "./index-table.js";
export {
  BackendAuthGate,
  useBackendAuthGate,
  type BackendAuthGateMode,
} from "./backend-auth-gate.js";
export { CoreHeader, CoreLayout, CoreRoot } from "./layout.js";
export { DriveNotFoundPage, NotFoundPage } from "./not-found-page.js";
export {
  ConfirmDocumentUpgradeModal,
  CreateDocumentModal,
  DeleteItemModal,
  DocumentVersionUnsupportedModal,
  DownloadDocumentWithErrorsModal,
  DriveAuthRequiredModal,
  LoginModal,
} from "./modals.js";
export { CoreRouteError } from "./route-views.js";
export { AppearanceTab, CoreSettingsPage } from "./settings.js";
export { PackagesTab } from "./settings-packages.js";
export { ThemeToggle } from "./theme-toggle.js";
