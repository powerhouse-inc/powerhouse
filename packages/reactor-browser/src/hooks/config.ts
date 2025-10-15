import {
  useSupportedDocumentTypes,
  type PHGlobalConfig,
  type PHGlobalConfigHooks,
  type PHGlobalConfigKey,
  type PHGlobalConfigSetters,
} from "@powerhousedao/reactor-browser";
import { useEffect, useState } from "react";
import { makePHEventFunctions } from "./make-ph-event-functions.js";

export const {
  useValue: useRouterBasename,
  setValue: setRouterBasename,
  addEventHandler: addRouterBasenameEventHandler,
} = makePHEventFunctions("routerBasename");

export const {
  useValue: useVersion,
  setValue: setVersion,
  addEventHandler: addVersionEventHandler,
} = makePHEventFunctions("version");

export const {
  useValue: useLogLevel,
  setValue: setLogLevel,
  addEventHandler: addLogLevelEventHandler,
} = makePHEventFunctions("logLevel");

export const {
  useValue: useRequiresHardRefresh,
  setValue: setRequiresHardRefresh,
  addEventHandler: addRequiresHardRefreshEventHandler,
} = makePHEventFunctions("requiresHardRefresh");

export const {
  useValue: useWarnOutdatedApp,
  setValue: setWarnOutdatedApp,
  addEventHandler: addWarnOutdatedAppEventHandler,
} = makePHEventFunctions("warnOutdatedApp");

export const {
  useValue: useStudioMode,
  setValue: setStudioMode,
  addEventHandler: addStudioModeEventHandler,
} = makePHEventFunctions("studioMode");

export const {
  useValue: useBasePath,
  setValue: setBasePath,
  addEventHandler: addBasePathEventHandler,
} = makePHEventFunctions("basePath");

export const {
  useValue: useVersionCheckInterval,
  setValue: setVersionCheckInterval,
  addEventHandler: addVersionCheckIntervalEventHandler,
} = makePHEventFunctions("versionCheckInterval");

export const {
  useValue: useCliVersion,
  setValue: setCliVersion,
  addEventHandler: addCliVersionEventHandler,
} = makePHEventFunctions("cliVersion");

export const {
  useValue: useFileUploadOperationsChunkSize,
  setValue: setFileUploadOperationsChunkSize,
  addEventHandler: addFileUploadOperationsChunkSizeEventHandler,
} = makePHEventFunctions("fileUploadOperationsChunkSize");

export const {
  useValue: useIsDocumentModelSelectionSettingsEnabled,
  setValue: setIsDocumentModelSelectionSettingsEnabled,
  addEventHandler: addIsDocumentModelSelectionSettingsEnabledEventHandler,
} = makePHEventFunctions("isDocumentModelSelectionSettingsEnabled");

export const {
  useValue: useGaTrackingId,
  setValue: setGaTrackingId,
  addEventHandler: addGaTrackingIdEventHandler,
} = makePHEventFunctions("gaTrackingId");

export const {
  useValue: useAllowList,
  setValue: setAllowList,
  addEventHandler: addAllowListEventHandler,
} = makePHEventFunctions("allowList");

export const {
  useValue: useDefaultDrivesUrl,
  setValue: setDefaultDrivesUrl,
  addEventHandler: addDefaultDrivesUrlEventHandler,
} = makePHEventFunctions("defaultDrivesUrl");

export const {
  useValue: useDrivesPreserveStrategy,
  setValue: setDrivesPreserveStrategy,
  addEventHandler: addDrivesPreserveStrategyEventHandler,
} = makePHEventFunctions("drivesPreserveStrategy");

const allowedDocumentTypesEventFunctions = makePHEventFunctions(
  "allowedDocumentTypes",
);
export const setAllowedDocumentTypes =
  allowedDocumentTypesEventFunctions.setValue;

/** Defines the document types a drive supports.
 *
 * Defaults to all of the document types registered in the reactor.
 */
export function useAllowedDocumentTypes() {
  const definedAllowedDocumentTypes =
    allowedDocumentTypesEventFunctions.useValue();
  const supportedDocumentTypes = useSupportedDocumentTypes();
  return definedAllowedDocumentTypes ?? supportedDocumentTypes;
}

export const addAllowedDocumentTypesEventHandler =
  allowedDocumentTypesEventFunctions.addEventHandler;

export const {
  useValue: useEnabledEditors,
  setValue: setEnabledEditors,
  addEventHandler: addEnabledEditorsEventHandler,
} = makePHEventFunctions("enabledEditors");

export const {
  useValue: useDisabledEditors,
  setValue: setDisabledEditors,
  addEventHandler: addDisabledEditorsEventHandler,
} = makePHEventFunctions("disabledEditors");

export const {
  useValue: useIsAddDriveEnabled,
  setValue: setIsAddDriveEnabled,
  addEventHandler: addIsAddDriveEnabledEventHandler,
} = makePHEventFunctions("isAddDriveEnabled");

export const {
  useValue: useIsPublicDrivesEnabled,
  setValue: setIsPublicDrivesEnabled,
  addEventHandler: addIsPublicDrivesEnabledEventHandler,
} = makePHEventFunctions("isPublicDrivesEnabled");

export const {
  useValue: useIsAddPublicDrivesEnabled,
  setValue: setIsAddPublicDrivesEnabled,
  addEventHandler: addIsAddPublicDrivesEnabledEventHandler,
} = makePHEventFunctions("isAddPublicDrivesEnabled");

export const {
  useValue: useIsDeletePublicDrivesEnabled,
  setValue: setIsDeletePublicDrivesEnabled,
  addEventHandler: addIsDeletePublicDrivesEnabledEventHandler,
} = makePHEventFunctions("isDeletePublicDrivesEnabled");

export const {
  useValue: useIsCloudDrivesEnabled,
  setValue: setIsCloudDrivesEnabled,
  addEventHandler: addIsCloudDrivesEnabledEventHandler,
} = makePHEventFunctions("isCloudDrivesEnabled");

export const {
  useValue: useIsAddCloudDrivesEnabled,
  setValue: setIsAddCloudDrivesEnabled,
  addEventHandler: addIsAddCloudDrivesEnabledEventHandler,
} = makePHEventFunctions("isAddCloudDrivesEnabled");

export const {
  useValue: useIsDeleteCloudDrivesEnabled,
  setValue: setIsDeleteCloudDrivesEnabled,
  addEventHandler: addIsDeleteCloudDrivesEnabledEventHandler,
} = makePHEventFunctions("isDeleteCloudDrivesEnabled");

export const {
  useValue: useLocalDrivesEnabled,
  setValue: setLocalDrivesEnabled,
  addEventHandler: addLocalDrivesEnabledEventHandler,
} = makePHEventFunctions("localDrivesEnabled");

export const {
  useValue: useIsAddLocalDrivesEnabled,
  setValue: setIsAddLocalDrivesEnabled,
  addEventHandler: addIsAddLocalDrivesEnabledEventHandler,
} = makePHEventFunctions("isAddLocalDrivesEnabled");

export const {
  useValue: useIsDeleteLocalDrivesEnabled,
  setValue: setIsDeleteLocalDrivesEnabled,
  addEventHandler: addIsDeleteLocalDrivesEnabledEventHandler,
} = makePHEventFunctions("isDeleteLocalDrivesEnabled");

export const {
  useValue: useIsSearchBarEnabled,
  setValue: setIsSearchBarEnabled,
  addEventHandler: addIsSearchBarEnabledEventHandler,
} = makePHEventFunctions("isSearchBarEnabled");

export const {
  useValue: useIsDragAndDropEnabled,
  setValue: setIsDragAndDropEnabled,
  addEventHandler: addIsDragAndDropEnabledEventHandler,
} = makePHEventFunctions("isDragAndDropEnabled");

export const {
  useValue: useIsExternalControlsEnabled,
  setValue: setIsExternalControlsEnabled,
  addEventHandler: addIsExternalControlsEnabledEventHandler,
} = makePHEventFunctions("isExternalControlsEnabled");

export const {
  useValue: useIsDocumentToolbarEnabled,
  setValue: setIsDocumentToolbarEnabled,
  addEventHandler: addIsDocumentToolbarEnabledEventHandler,
} = makePHEventFunctions("isDocumentToolbarEnabled");

export const {
  useValue: useIsSwitchboardLinkEnabled,
  setValue: setIsSwitchboardLinkEnabled,
  addEventHandler: addIsSwitchboardLinkEnabledEventHandler,
} = makePHEventFunctions("isSwitchboardLinkEnabled");

export const {
  useValue: useIsTimelineEnabled,
  setValue: setIsTimelineEnabled,
  addEventHandler: addIsTimelineEnabledEventHandler,
} = makePHEventFunctions("isTimelineEnabled");

export const {
  useValue: useIsEditorDebugModeEnabled,
  setValue: setIsEditorDebugModeEnabled,
  addEventHandler: addIsEditorDebugModeEnabledEventHandler,
} = makePHEventFunctions("isEditorDebugModeEnabled");

export const {
  useValue: useIsEditorReadModeEnabled,
  setValue: setIsEditorReadModeEnabled,
  addEventHandler: addIsEditorReadModeEnabledEventHandler,
} = makePHEventFunctions("isEditorReadModeEnabled");

export const {
  useValue: useAnalyticsDatabaseName,
  setValue: setAnalyticsDatabaseName,
  addEventHandler: addAnalyticsDatabaseNameEventHandler,
} = makePHEventFunctions("analyticsDatabaseName");

export const {
  useValue: useIsAnalyticsDatabaseWorkerEnabled,
  setValue: setIsAnalyticsDatabaseWorkerEnabled,
  addEventHandler: addIsAnalyticsDatabaseWorkerEnabledEventHandler,
} = makePHEventFunctions("isAnalyticsDatabaseWorkerEnabled");

export const {
  useValue: useIsDiffAnalyticsEnabled,
  setValue: setIsDiffAnalyticsEnabled,
  addEventHandler: addIsDiffAnalyticsEnabledEventHandler,
} = makePHEventFunctions("isDiffAnalyticsEnabled");

export const {
  useValue: useIsDriveAnalyticsEnabled,
  setValue: setIsDriveAnalyticsEnabled,
  addEventHandler: addIsDriveAnalyticsEnabledEventHandler,
} = makePHEventFunctions("isDriveAnalyticsEnabled");

export const {
  useValue: useRenownUrl,
  setValue: setRenownUrl,
  addEventHandler: addRenownUrlEventHandler,
} = makePHEventFunctions("renownUrl");

export const {
  useValue: useRenownNetworkId,
  setValue: setRenownNetworkId,
  addEventHandler: addRenownNetworkIdEventHandler,
} = makePHEventFunctions("renownNetworkId");

export const {
  useValue: useRenownChainId,
  setValue: setRenownChainId,
  addEventHandler: addRenownChainIdEventHandler,
} = makePHEventFunctions("renownChainId");

export const {
  useValue: useSentryRelease,
  setValue: setSentryRelease,
  addEventHandler: addSentryReleaseEventHandler,
} = makePHEventFunctions("sentryRelease");

export const {
  useValue: useSentryDsn,
  setValue: setSentryDsn,
  addEventHandler: addSentryDsnEventHandler,
} = makePHEventFunctions("sentryDsn");

export const {
  useValue: useSentryEnv,
  setValue: setSentryEnv,
  addEventHandler: addSentryEnvEventHandler,
} = makePHEventFunctions("sentryEnv");

export const {
  useValue: useIsSentryTracingEnabled,
  setValue: setIsSentryTracingEnabled,
  addEventHandler: addIsSentryTracingEnabledEventHandler,
} = makePHEventFunctions("isSentryTracingEnabled");

export const {
  useValue: useIsExternalProcessorsEnabled,
  setValue: setIsExternalProcessorsEnabled,
  addEventHandler: addIsExternalProcessorsEnabledEventHandler,
} = makePHEventFunctions("isExternalProcessorsEnabled");

export const {
  useValue: useIsExternalPackagesEnabled,
  setValue: setIsExternalPackagesEnabled,
  addEventHandler: addIsExternalPackagesEnabledEventHandler,
} = makePHEventFunctions("isExternalPackagesEnabled");

export const phGlobalConfigSetters: PHGlobalConfigSetters = {
  routerBasename: setRouterBasename,
  version: setVersion,
  logLevel: setLogLevel,
  requiresHardRefresh: setRequiresHardRefresh,
  warnOutdatedApp: setWarnOutdatedApp,
  studioMode: setStudioMode,
  basePath: setBasePath,
  versionCheckInterval: setVersionCheckInterval,
  cliVersion: setCliVersion,
  fileUploadOperationsChunkSize: setFileUploadOperationsChunkSize,
  isDocumentModelSelectionSettingsEnabled:
    setIsDocumentModelSelectionSettingsEnabled,
  gaTrackingId: setGaTrackingId,
  allowList: setAllowList,
  defaultDrivesUrl: setDefaultDrivesUrl,
  drivesPreserveStrategy: setDrivesPreserveStrategy,
  allowedDocumentTypes: setAllowedDocumentTypes,
  enabledEditors: setEnabledEditors,
  disabledEditors: setDisabledEditors,
  isAddDriveEnabled: setIsAddDriveEnabled,
  isPublicDrivesEnabled: setIsPublicDrivesEnabled,
  isAddPublicDrivesEnabled: setIsAddPublicDrivesEnabled,
  isDeletePublicDrivesEnabled: setIsDeletePublicDrivesEnabled,
  isCloudDrivesEnabled: setIsCloudDrivesEnabled,
  isAddCloudDrivesEnabled: setIsAddCloudDrivesEnabled,
  isDeleteCloudDrivesEnabled: setIsDeleteCloudDrivesEnabled,
  localDrivesEnabled: setLocalDrivesEnabled,
  isAddLocalDrivesEnabled: setIsAddLocalDrivesEnabled,
  isDeleteLocalDrivesEnabled: setIsDeleteLocalDrivesEnabled,
  isSearchBarEnabled: setIsSearchBarEnabled,
  isDragAndDropEnabled: setIsDragAndDropEnabled,
  isExternalControlsEnabled: setIsExternalControlsEnabled,
  isDocumentToolbarEnabled: setIsDocumentToolbarEnabled,
  isSwitchboardLinkEnabled: setIsSwitchboardLinkEnabled,
  isTimelineEnabled: setIsTimelineEnabled,
  isEditorDebugModeEnabled: setIsEditorDebugModeEnabled,
  isEditorReadModeEnabled: setIsEditorReadModeEnabled,
  analyticsDatabaseName: setAnalyticsDatabaseName,
  isAnalyticsDatabaseWorkerEnabled: setIsAnalyticsDatabaseWorkerEnabled,
  isDiffAnalyticsEnabled: setIsDiffAnalyticsEnabled,
  isDriveAnalyticsEnabled: setIsDriveAnalyticsEnabled,
  renownUrl: setRenownUrl,
  renownNetworkId: setRenownNetworkId,
  renownChainId: setRenownChainId,
  sentryRelease: setSentryRelease,
  sentryDsn: setSentryDsn,
  sentryEnv: setSentryEnv,
  isSentryTracingEnabled: setIsSentryTracingEnabled,
  isExternalProcessorsEnabled: setIsExternalProcessorsEnabled,
  isExternalPackagesEnabled: setIsExternalPackagesEnabled,
};

export const phGlobalConfigHooks: PHGlobalConfigHooks = {
  routerBasename: useRouterBasename,
  version: useVersion,
  logLevel: useLogLevel,
  requiresHardRefresh: useRequiresHardRefresh,
  warnOutdatedApp: useWarnOutdatedApp,
  studioMode: useStudioMode,
  basePath: useBasePath,
  versionCheckInterval: useVersionCheckInterval,
  cliVersion: useCliVersion,
  fileUploadOperationsChunkSize: useFileUploadOperationsChunkSize,
  isDocumentModelSelectionSettingsEnabled:
    useIsDocumentModelSelectionSettingsEnabled,
  gaTrackingId: useGaTrackingId,
  allowList: useAllowList,
  defaultDrivesUrl: useDefaultDrivesUrl,
  drivesPreserveStrategy: useDrivesPreserveStrategy,
  allowedDocumentTypes: useAllowedDocumentTypes,
  enabledEditors: useEnabledEditors,
  disabledEditors: useDisabledEditors,
  isAddDriveEnabled: useIsAddDriveEnabled,
  isPublicDrivesEnabled: useIsPublicDrivesEnabled,
  isAddPublicDrivesEnabled: useIsAddPublicDrivesEnabled,
  isDeletePublicDrivesEnabled: useIsDeletePublicDrivesEnabled,
  isCloudDrivesEnabled: useIsCloudDrivesEnabled,
  isAddCloudDrivesEnabled: useIsAddCloudDrivesEnabled,
  isDeleteCloudDrivesEnabled: useIsDeleteCloudDrivesEnabled,
  localDrivesEnabled: useLocalDrivesEnabled,
  isAddLocalDrivesEnabled: useIsAddLocalDrivesEnabled,
  isDeleteLocalDrivesEnabled: useIsDeleteLocalDrivesEnabled,
  isSearchBarEnabled: useIsSearchBarEnabled,
  isDragAndDropEnabled: useIsDragAndDropEnabled,
  isExternalControlsEnabled: useIsExternalControlsEnabled,
  isDocumentToolbarEnabled: useIsDocumentToolbarEnabled,
  isSwitchboardLinkEnabled: useIsSwitchboardLinkEnabled,
  isTimelineEnabled: useIsTimelineEnabled,
  isEditorDebugModeEnabled: useIsEditorDebugModeEnabled,
  isEditorReadModeEnabled: useIsEditorReadModeEnabled,
  analyticsDatabaseName: useAnalyticsDatabaseName,
  isAnalyticsDatabaseWorkerEnabled: useIsAnalyticsDatabaseWorkerEnabled,
  isDiffAnalyticsEnabled: useIsDiffAnalyticsEnabled,
  isDriveAnalyticsEnabled: useIsDriveAnalyticsEnabled,
  renownUrl: useRenownUrl,
  renownNetworkId: useRenownNetworkId,
  renownChainId: useRenownChainId,
  sentryRelease: useSentryRelease,
  sentryDsn: useSentryDsn,
  sentryEnv: useSentryEnv,
  isSentryTracingEnabled: useIsSentryTracingEnabled,
  isExternalProcessorsEnabled: useIsExternalProcessorsEnabled,
  isExternalPackagesEnabled: useIsExternalPackagesEnabled,
};

function callGlobalSetterForKey<TKey extends PHGlobalConfigKey>(
  key: TKey,
  value: PHGlobalConfig[TKey] | undefined,
) {
  const setter = phGlobalConfigSetters[key] as PHGlobalConfigSetters[TKey];
  setter(value);
}
export function setDefaultPHGlobalConfig(config: PHGlobalConfig) {
  for (const key of Object.keys(config) as PHGlobalConfigKey[]) {
    callGlobalSetterForKey(key, config[key]);
  }
}

export function useSetDefaultPHGlobalConfig(config: PHGlobalConfig) {
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    if (isInitialized) return;
    setDefaultPHGlobalConfig(config);
    setIsInitialized(true);
  }, [config, isInitialized]);
}

export function setPHGlobalConfig(config: Partial<PHGlobalConfig>) {
  for (const key of Object.keys(config) as PHGlobalConfigKey[]) {
    callGlobalSetterForKey(key, config[key]);
  }
}

export function useSetPHGlobalConfig(config: Partial<PHGlobalConfig>) {
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    if (isInitialized) return;
    setPHGlobalConfig(config);
    setIsInitialized(true);
  }, [config, isInitialized]);
}
