import type { PHGlobalEventHandlerAdders } from "../types/global.js";
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
  addRenownAdaptersEventHandler,
  addRenownChainIdEventHandler,
  addRenownNetworkIdEventHandler,
  addRenownUrlEventHandler,
  addRequiresHardRefreshEventHandler,
  addRouterBasenameEventHandler,
  addSentryDsnEventHandler,
  addSentryEnvEventHandler,
  addSentryReleaseEventHandler,
  addStudioModeEventHandler,
  addSwitchboardUrlEventHandler,
  addVersionCheckIntervalEventHandler,
  addVersionEventHandler,
  addWarnOutdatedAppEventHandler,
} from "./config/connect.js";
import { addAttachmentServiceEventHandler } from "./attachment-service.js";
import { addFeaturesEventHandler } from "./features.js";

import { forEachObj } from "remeda";
import {
  addAllowedDocumentTypesEventHandler,
  addIsDragAndDropEnabledEventHandler,
  addIsExternalControlsEnabledEventHandler,
} from "./config/editor.js";
import { addDocumentCacheEventHandler } from "./document-cache.js";
import { addDraggingNodeEventHandler } from "./node-drag-and-drop.js";
import { addDrivesEventHandler } from "./drives.js";
import { addGraphQLReactorClientEventHandler } from "./graphql-reactor-client.js";
import { addLoadingEventHandler } from "./loading.js";
import { addModalEventHandler } from "./modals.js";
import { addPackageDiscoveryServiceEventHandler } from "./package-discovery.js";
import {
  addReactorClientEventHandler,
  addReactorClientModuleEventHandler,
} from "./reactor.js";
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
import { addToastEventHandler } from "./toast.js";
import { addVetraPackageManagerEventHandler } from "./vetra-packages.js";

export const commonGlobalEventHandlerFunctions = {
  loading: addLoadingEventHandler,
  drives: addDrivesEventHandler,
  selectedDriveId: () => {
    addSelectedDriveIdEventHandler();
    addSetSelectedDriveOnPopStateEventHandler();
    addResetSelectedNodeEventHandler();
  },
  selectedNodeId: () => {
    addSelectedNodeIdEventHandler();
    addSetSelectedNodeOnPopStateEventHandler();
  },
  documentCache: addDocumentCacheEventHandler,
  reactorGraphQLClient: addGraphQLReactorClientEventHandler,
  draggingNode: addDraggingNodeEventHandler,
};

const phGlobalEventHandlerRegisterFunctions: PHGlobalEventHandlerAdders = {
  ...commonGlobalEventHandlerFunctions,
  reactorClientModule: addReactorClientModuleEventHandler,
  reactorClient: addReactorClientEventHandler,
  attachmentService: addAttachmentServiceEventHandler,
  features: addFeaturesEventHandler,
  modal: addModalEventHandler,
  renown: addRenownEventHandler,
  vetraPackageManager: addVetraPackageManagerEventHandler,
  packageDiscoveryService: addPackageDiscoveryServiceEventHandler,
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
  switchboardUrl: addSwitchboardUrlEventHandler,
  renownAdapters: addRenownAdaptersEventHandler,
  sentryRelease: addSentryReleaseEventHandler,
  sentryDsn: addSentryDsnEventHandler,
  sentryEnv: addSentryEnvEventHandler,
  isSentryTracingEnabled: addIsSentryTracingEnabledEventHandler,
  isExternalProcessorsEnabled: addIsExternalProcessorsEnabledEventHandler,
  isExternalPackagesEnabled: addIsExternalPackagesEnabledEventHandler,
  toast: addToastEventHandler,
};
export function addPHEventHandlers() {
  callEventHandlerRegisterFunctions(phGlobalEventHandlerRegisterFunctions);
}

export function callEventHandlerRegisterFunctions(
  registerFunctions: Record<string, () => void>,
) {
  forEachObj(registerFunctions, (fn) => fn());
}
