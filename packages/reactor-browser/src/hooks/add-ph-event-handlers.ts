import type { PHGlobalEventHandlerAdders } from "@powerhousedao/reactor-browser";
import {
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
  addIsAnalyticsEnabledEventHandler,
  addIsAnalyticsExternalProcessorsEnabledEventHandler,
  addIsCloudDrivesEnabledEventHandler,
  addIsDeleteCloudDrivesEnabledEventHandler,
  addIsDeleteLocalDrivesEnabledEventHandler,
  addIsDeletePublicDrivesEnabledEventHandler,
  addIsDiffAnalyticsEnabledEventHandler,
  addIsDocumentModelSelectionSettingsEnabledEventHandler,
  addIsDriveAnalyticsEnabledEventHandler,
  addIsEditorDebugModeEnabledEventHandler,
  addIsEditorReadModeEnabledEventHandler,
  addIsExternalPackagesEnabledEventHandler,
  addIsExternalProcessorsEnabledEventHandler,
  addIsExternalRelationalProcessorsEnabledEventHandler,
  addIsLocalDrivesEnabledEventHandler,
  addIsPublicDrivesEnabledEventHandler,
  addIsRelationalProcessorsEnabledEventHandler,
  addIsSentryTracingEnabledEventHandler,
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
} from "./config/connect.js";

import {
  addAllowedDocumentTypesEventHandler,
  addIsDragAndDropEnabledEventHandler,
  addIsExternalControlsEnabledEventHandler,
} from "./config/editor.js";
import { addConnectCryptoEventHandler } from "./crypto.js";
import { addDidEventHandler } from "./did.js";
import { addDocumentCacheEventHandler } from "./document-cache.js";
import { addDrivesEventHandler } from "./drives.js";
import { addLoadingEventHandler } from "./loading.js";
import { addLoginStatusEventHandler } from "./login-status.js";
import { addModalEventHandler } from "./modals.js";
import { addProcessorManagerEventHandler } from "./processor-manager.js";
import { addLegacyReactorEventHandler } from "./reactor.js";
import { addRenownEventHandler } from "./renown.js";
import { addRevisionHistoryVisibleEventHandler } from "./revision-history.js";
import {
  addSelectedDriveIdEventHandler,
  addSetSelectedDriveOnPopStateEventHandler,
} from "./selected-drive.js";
import {
  addResetSelectedNodeEventHandler,
  addSelectedNodeIdEventHandler,
  addSetSelectedNodeOnPopStateEventHandler,
} from "./selected-node.js";
import { addSelectedTimelineItemEventHandler } from "./selected-timeline-item.js";
import { addSelectedTimelineRevisionEventHandler } from "./timeline-revision.js";
import { addUserEventHandler } from "./user.js";
import { addVetraPackagesEventHandler } from "./vetra-packages.js";

const phGlobalEventHandlerRegisterFunctions: PHGlobalEventHandlerAdders = {
  loading: addLoadingEventHandler,
  legacyReactor: addLegacyReactorEventHandler,
  modal: addModalEventHandler,
  connectCrypto: addConnectCryptoEventHandler,
  did: addDidEventHandler,
  renown: addRenownEventHandler,
  loginStatus: addLoginStatusEventHandler,
  user: addUserEventHandler,
  processorManager: addProcessorManagerEventHandler,
  drives: addDrivesEventHandler,
  documentCache: addDocumentCacheEventHandler,
  selectedDriveId: () => {
    addSelectedDriveIdEventHandler();
    addSetSelectedDriveOnPopStateEventHandler();
    addResetSelectedNodeEventHandler();
  },
  selectedNodeId: () => {
    addSelectedNodeIdEventHandler();
    addSetSelectedNodeOnPopStateEventHandler();
  },
  vetraPackages: addVetraPackagesEventHandler,
  selectedTimelineRevision: addSelectedTimelineRevisionEventHandler,
  revisionHistoryVisible: addRevisionHistoryVisibleEventHandler,
  selectedTimelineItem: addSelectedTimelineItemEventHandler,
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
  isLocalDrivesEnabled: addIsLocalDrivesEnabledEventHandler,
  isPublicDrivesEnabled: addIsPublicDrivesEnabledEventHandler,
  isAddPublicDrivesEnabled: addIsAddPublicDrivesEnabledEventHandler,
  isDeletePublicDrivesEnabled: addIsDeletePublicDrivesEnabledEventHandler,
  isCloudDrivesEnabled: addIsCloudDrivesEnabledEventHandler,
  isAddCloudDrivesEnabled: addIsAddCloudDrivesEnabledEventHandler,
  isDeleteCloudDrivesEnabled: addIsDeleteCloudDrivesEnabledEventHandler,
  isAddLocalDrivesEnabled: addIsAddLocalDrivesEnabledEventHandler,
  isDeleteLocalDrivesEnabled: addIsDeleteLocalDrivesEnabledEventHandler,
  isDragAndDropEnabled: addIsDragAndDropEnabledEventHandler,
  isExternalControlsEnabled: addIsExternalControlsEnabledEventHandler,
  isEditorDebugModeEnabled: addIsEditorDebugModeEnabledEventHandler,
  isEditorReadModeEnabled: addIsEditorReadModeEnabledEventHandler,
  isRelationalProcessorsEnabled: addIsRelationalProcessorsEnabledEventHandler,
  isExternalRelationalProcessorsEnabled:
    addIsExternalRelationalProcessorsEnabledEventHandler,
  isAnalyticsEnabled: addIsAnalyticsEnabledEventHandler,
  isAnalyticsExternalProcessorsEnabled:
    addIsAnalyticsExternalProcessorsEnabledEventHandler,
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
