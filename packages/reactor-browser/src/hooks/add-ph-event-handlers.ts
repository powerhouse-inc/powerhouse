import type { PHGlobalEventHandlerAdders } from "@powerhousedao/reactor-browser";
import { addAllDocumentsEventHandler } from "./all-documents.js";
import {
  addAllowedDocumentTypesEventHandler,
  addAllowListEventHandler,
  addAnalyticsDatabaseNameEventHandler,
  addBasePathEventHandler,
  addCliVersionEventHandler,
  addDefaultDrivesUrlEventHandler,
  addDisabledEditorsEventHandler,
  addDrivesPreserveStrategyEventHandler,
  addEnabledEditorsEventHandler,
  addFileUploadOperationsChunkSizeEventHandler,
  addGaTrackingIdEventHandler,
  addIsAddCloudDrivesEnabledEventHandler,
  addIsAddDriveEnabledEventHandler,
  addIsAddLocalDrivesEnabledEventHandler,
  addIsAddPublicDrivesEnabledEventHandler,
  addIsAnalyticsDatabaseWorkerEnabledEventHandler,
  addIsCloudDrivesEnabledEventHandler,
  addIsDeleteCloudDrivesEnabledEventHandler,
  addIsDeleteLocalDrivesEnabledEventHandler,
  addIsDeletePublicDrivesEnabledEventHandler,
  addIsDiffAnalyticsEnabledEventHandler,
  addIsDocumentModelSelectionSettingsEnabledEventHandler,
  addIsDocumentToolbarEnabledEventHandler,
  addIsDragAndDropEnabledEventHandler,
  addIsDriveAnalyticsEnabledEventHandler,
  addIsEditorDebugModeEnabledEventHandler,
  addIsEditorReadModeEnabledEventHandler,
  addIsExternalControlsEnabledEventHandler,
  addIsExternalPackagesEnabledEventHandler,
  addIsExternalProcessorsEnabledEventHandler,
  addIsPublicDrivesEnabledEventHandler,
  addIsSearchBarEnabledEventHandler,
  addIsSentryTracingEnabledEventHandler,
  addIsSwitchboardLinkEnabledEventHandler,
  addIsTimelineEnabledEventHandler,
  addLocalDrivesEnabledEventHandler,
  addLogLevelEventHandler,
  addRenownChainIdEventHandler,
  addRenownNetworkIdEventHandler,
  addRenownUrlEventHandler,
  addRequiresHardRefreshEventHandler,
  addRouterBasenameEventHandler,
  addSentryDsnEventHandler,
  addSentryEnvEventHandler,
  addSentryReleaseEventHandler,
  addStudioModeEventHandler,
  addVersionCheckIntervalEventHandler,
  addVersionEventHandler,
  addWarnOutdatedAppEventHandler,
} from "./config.js";
import { addConnectCryptoEventHandler } from "./crypto.js";
import { addDidEventHandler } from "./did.js";
import { addDrivesEventHandler } from "./drives.js";
import { addLoadingEventHandler } from "./loading.js";
import { addLoginStatusEventHandler } from "./login-status.js";
import { addModalEventHandler } from "./modals.js";
import { addProcessorManagerEventHandler } from "./processor-manager.js";
import { addReactorEventHandler } from "./reactor.js";
import { addRenownEventHandler } from "./renown.js";
import { addSelectedDriveIdEventHandler } from "./selected-drive.js";
import { addSelectedNodeIdEventHandler } from "./selected-node.js";
import { addSelectedTimelineRevisionEventHandler } from "./timeline-revision.js";
import { addUserEventHandler } from "./user.js";
import { addVetraPackagesEventHandler } from "./vetra-packages.js";

const phGlobalEventHandlerRegisterFunctions: PHGlobalEventHandlerAdders = {
  loading: addLoadingEventHandler,
  reactor: addReactorEventHandler,
  modal: addModalEventHandler,
  connectCrypto: addConnectCryptoEventHandler,
  did: addDidEventHandler,
  renown: addRenownEventHandler,
  loginStatus: addLoginStatusEventHandler,
  user: addUserEventHandler,
  processorManager: addProcessorManagerEventHandler,
  drives: addDrivesEventHandler,
  documents: addAllDocumentsEventHandler,
  selectedDriveId: addSelectedDriveIdEventHandler,
  selectedNodeId: addSelectedNodeIdEventHandler,
  vetraPackages: addVetraPackagesEventHandler,
  selectedTimelineRevision: addSelectedTimelineRevisionEventHandler,
  routerBasename: addRouterBasenameEventHandler,
  version: addVersionEventHandler,
  logLevel: addLogLevelEventHandler,
  requiresHardRefresh: addRequiresHardRefreshEventHandler,
  warnOutdatedApp: addWarnOutdatedAppEventHandler,
  studioMode: addStudioModeEventHandler,
  basePath: addBasePathEventHandler,
  versionCheckInterval: addVersionCheckIntervalEventHandler,
  cliVersion: addCliVersionEventHandler,
  fileUploadOperationsChunkSize: addFileUploadOperationsChunkSizeEventHandler,
  isDocumentModelSelectionSettingsEnabled:
    addIsDocumentModelSelectionSettingsEnabledEventHandler,
  gaTrackingId: addGaTrackingIdEventHandler,
  allowList: addAllowListEventHandler,
  defaultDrivesUrl: addDefaultDrivesUrlEventHandler,
  drivesPreserveStrategy: addDrivesPreserveStrategyEventHandler,
  allowedDocumentTypes: addAllowedDocumentTypesEventHandler,
  enabledEditors: addEnabledEditorsEventHandler,
  disabledEditors: addDisabledEditorsEventHandler,
  isAddDriveEnabled: addIsAddDriveEnabledEventHandler,
  isPublicDrivesEnabled: addIsPublicDrivesEnabledEventHandler,
  isAddPublicDrivesEnabled: addIsAddPublicDrivesEnabledEventHandler,
  isDeletePublicDrivesEnabled: addIsDeletePublicDrivesEnabledEventHandler,
  isCloudDrivesEnabled: addIsCloudDrivesEnabledEventHandler,
  isAddCloudDrivesEnabled: addIsAddCloudDrivesEnabledEventHandler,
  isDeleteCloudDrivesEnabled: addIsDeleteCloudDrivesEnabledEventHandler,
  localDrivesEnabled: addLocalDrivesEnabledEventHandler,
  isAddLocalDrivesEnabled: addIsAddLocalDrivesEnabledEventHandler,
  isDeleteLocalDrivesEnabled: addIsDeleteLocalDrivesEnabledEventHandler,
  isSearchBarEnabled: addIsSearchBarEnabledEventHandler,
  isDragAndDropEnabled: addIsDragAndDropEnabledEventHandler,
  isExternalControlsEnabled: addIsExternalControlsEnabledEventHandler,
  isDocumentToolbarEnabled: addIsDocumentToolbarEnabledEventHandler,
  isSwitchboardLinkEnabled: addIsSwitchboardLinkEnabledEventHandler,
  isTimelineEnabled: addIsTimelineEnabledEventHandler,
  isEditorDebugModeEnabled: addIsEditorDebugModeEnabledEventHandler,
  isEditorReadModeEnabled: addIsEditorReadModeEnabledEventHandler,
  analyticsDatabaseName: addAnalyticsDatabaseNameEventHandler,
  isAnalyticsDatabaseWorkerEnabled:
    addIsAnalyticsDatabaseWorkerEnabledEventHandler,
  isDiffAnalyticsEnabled: addIsDiffAnalyticsEnabledEventHandler,
  isDriveAnalyticsEnabled: addIsDriveAnalyticsEnabledEventHandler,
  renownUrl: addRenownUrlEventHandler,
  renownNetworkId: addRenownNetworkIdEventHandler,
  renownChainId: addRenownChainIdEventHandler,
  sentryRelease: addSentryReleaseEventHandler,
  sentryDsn: addSentryDsnEventHandler,
  sentryEnv: addSentryEnvEventHandler,
  isSentryTracingEnabled: addIsSentryTracingEnabledEventHandler,
  isExternalProcessorsEnabled: addIsExternalProcessorsEnabledEventHandler,
  isExternalPackagesEnabled: addIsExternalPackagesEnabledEventHandler,
};
export function addPHEventHandlers() {
  for (const fn of Object.values(phGlobalEventHandlerRegisterFunctions)) {
    fn();
  }
}
