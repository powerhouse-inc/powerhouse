import type { PHGlobalEventHandlerAdders } from "../types/global.js";
import { addBackendAuthEventHandler } from "./backend-auth.js";
import { addLocalSignInEventHandler } from "./local-sign-in.js";
import {
  addAllowListEventHandler,
  addBasePathEventHandler,
  addDefaultDrivesUrlEventHandler,
  addDisabledEditorsEventHandler,
  addIsAddDriveEnabledEventHandler,
  addLogLevelEventHandler,
  addRenownUrlEventHandler,
  addRouterBasenameEventHandler,
  addStudioModeEventHandler,
  addSwitchboardUrlEventHandler,
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
import { addDriveNodesEventHandler } from "./drive-nodes.js";
import { addGraphQLReactorClientEventHandler } from "./graphql-reactor-client.js";
import { addLoadingEventHandler } from "./loading.js";
import { addModalEventHandler } from "./modals.js";
import { addPackageDiscoveryServiceEventHandler } from "./package-discovery.js";
import {
  addFullReactorClientEventHandler,
  addReactorClientEventHandler,
  addReactorClientModuleEventHandler,
  addReactorHalvesEventHandler,
} from "./reactor.js";
import { addRenownEventHandler } from "./renown.js";
import { addSelectedDriveIdEventHandler } from "./selected-drive.js";
import { addSwitchboardsEventHandler } from "./switchboards.js";
import { addResetSelectedNodeEventHandler } from "./selected-node.js";
import { addSelectedNodeIdEventHandler } from "./set-selected-node.js";
import { addSyncSelectionOnPopStateEventHandler } from "./sync-selection.js";
import { addSelectedTimelineItemEventHandler } from "./selected-timeline-item.js";
import { addSelectedTimelineRevisionEventHandler } from "./timeline-revision.js";
import { addToastEventHandler } from "./toast.js";
import { addVetraPackageManagerEventHandler } from "./vetra-packages.js";

export const commonGlobalEventHandlerFunctions = {
  loading: addLoadingEventHandler,
  drives: addDrivesEventHandler,
  backendAuth: addBackendAuthEventHandler,
  localSignIn: addLocalSignInEventHandler,
  driveNodes: addDriveNodesEventHandler,
  selectedDriveId: () => {
    addSelectedDriveIdEventHandler();
    addSyncSelectionOnPopStateEventHandler();
    addResetSelectedNodeEventHandler();
  },
  selectedNodeId: () => {
    addSelectedNodeIdEventHandler();
  },
  documentCache: addDocumentCacheEventHandler,
  reactorGraphQLClient: addGraphQLReactorClientEventHandler,
  draggingNode: addDraggingNodeEventHandler,
};

const phGlobalEventHandlerRegisterFunctions: PHGlobalEventHandlerAdders = {
  ...commonGlobalEventHandlerFunctions,
  reactorClientModule: addReactorClientModuleEventHandler,
  reactorClient: addReactorClientEventHandler,
  reactor: addReactorHalvesEventHandler,
  fullReactorClient: addFullReactorClientEventHandler,
  attachmentService: addAttachmentServiceEventHandler,
  switchboards: addSwitchboardsEventHandler,
  features: addFeaturesEventHandler,
  modal: addModalEventHandler,
  renown: addRenownEventHandler,
  vetraPackageManager: addVetraPackageManagerEventHandler,
  packageDiscoveryService: addPackageDiscoveryServiceEventHandler,
  selectedTimelineRevision: addSelectedTimelineRevisionEventHandler,
  selectedTimelineItem: addSelectedTimelineItemEventHandler,
  routerBasename: addRouterBasenameEventHandler,
  logLevel: addLogLevelEventHandler,
  warnOutdatedApp: addWarnOutdatedAppEventHandler,
  studioMode: addStudioModeEventHandler,
  basePath: addBasePathEventHandler,
  allowList: addAllowListEventHandler,
  defaultDrivesUrl: addDefaultDrivesUrlEventHandler,
  allowedDocumentTypes: addAllowedDocumentTypesEventHandler,
  disabledEditors: addDisabledEditorsEventHandler,
  isAddDriveEnabled: addIsAddDriveEnabledEventHandler,
  isDragAndDropEnabled: addIsDragAndDropEnabledEventHandler,
  isExternalControlsEnabled: addIsExternalControlsEnabledEventHandler,
  renownUrl: addRenownUrlEventHandler,
  switchboardUrl: addSwitchboardUrlEventHandler,
  toast: addToastEventHandler,
  // Set once by the host on its store; no event to listen for.
  navigation: () => {},
  aiTools: () => {},
};
export function addPHEventHandlers() {
  callEventHandlerRegisterFunctions(phGlobalEventHandlerRegisterFunctions);
}

export function callEventHandlerRegisterFunctions(
  registerFunctions: Record<string, () => void>,
) {
  forEachObj(registerFunctions, (fn) => fn());
}
