import type {
  PHDocumentEditorConfigKey,
  PHDriveEditorConfigKey,
  PHGlobalConfigHooks,
  PHGlobalConfigHooksForKey,
  PHGlobalConfigKey,
  PHGlobalConfigSetters,
  PHGlobalConfigSettersForKey,
} from "@powerhousedao/reactor-browser";
import { makePHEventFunctions } from "../make-ph-event-functions.js";
import {
  phDocumentEditorConfigHooks,
  phDocumentEditorConfigSetters,
  phDriveEditorConfigHooks,
  phDriveEditorConfigSetters,
} from "./editor.js";

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
  useValue: useDefaultDrivesUrl,
  setValue: setDefaultDrivesUrl,
  addEventHandler: addDefaultDrivesUrlEventHandler,
} = makePHEventFunctions("defaultDrivesUrl");

export const {
  useValue: useDrivesPreserveStrategy,
  setValue: setDrivesPreserveStrategy,
  addEventHandler: addDrivesPreserveStrategyEventHandler,
} = makePHEventFunctions("drivesPreserveStrategy");

export const {
  useValue: useIsLocalDrivesEnabled,
  setValue: setIsLocalDrivesEnabled,
  addEventHandler: addIsLocalDrivesEnabledEventHandler,
} = makePHEventFunctions("isLocalDrivesEnabled");

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
} = makePHEventFunctions("isLocalDrivesEnabled");

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

const enabledEditorsEventFunctions = makePHEventFunctions("enabledEditors");

/** Sets the enabled editors for Connect. */
export const setEnabledEditors = enabledEditorsEventFunctions.setValue;

/** Gets the enabled editors for Connect. */
export const useEnabledEditors = enabledEditorsEventFunctions.useValue;

/** Adds an event handler for when the enabled editors for Connect changes. */
export const addEnabledEditorsEventHandler =
  enabledEditorsEventFunctions.addEventHandler;

const disabledEditorsEventFunctions = makePHEventFunctions("disabledEditors");

/** Sets the disabled editors for Connect. */
export const setDisabledEditors = disabledEditorsEventFunctions.setValue;

/** Gets the disabled editors for Connect. */
export const useDisabledEditors = disabledEditorsEventFunctions.useValue;

/** Adds an event handler for when the disabled editors for Connect changes. */
export const addDisabledEditorsEventHandler =
  disabledEditorsEventFunctions.addEventHandler;

const isRelationalProcessorsEnabled = makePHEventFunctions(
  "isRelationalProcessorsEnabled",
);

/** Sets the isRelationalProcessorsEnabled for Connect. */
export const setIsRelationalProcessorsEnabled =
  isRelationalProcessorsEnabled.setValue;

/** Gets the isRelationalProcessorsEnabled for Connect. */
export const useIsRelationalProcessorsEnabled =
  isRelationalProcessorsEnabled.useValue;

/** Adds an event handler for when the isRelationalProcessorsEnabled for Connect changes. */
export const addIsRelationalProcessorsEnabledEventHandler =
  isRelationalProcessorsEnabled.addEventHandler;

const isExternalRelationalProcessorsEnabled = makePHEventFunctions(
  "isExternalRelationalProcessorsEnabled",
);

/** Sets the isExternalRelationalProcessorsEnabled for Connect. */
export const setIsExternalRelationalProcessorsEnabled =
  isExternalRelationalProcessorsEnabled.setValue;

/** Gets the isExternalRelationalProcessorsEnabled for Connect. */
export const useIsExternalRelationalProcessorsEnabled =
  isExternalRelationalProcessorsEnabled.useValue;

/** Adds an event handler for when the isExternalRelationalProcessorsEnabled for Connect changes. */
export const addIsExternalRelationalProcessorsEnabledEventHandler =
  isExternalRelationalProcessorsEnabled.addEventHandler;

const isAnalyticsEnabledEventFunctions =
  makePHEventFunctions("isAnalyticsEnabled");

/** Sets the isAnalyticsEnabled for Connect. */
export const setIsAnalyticsEnabled = isAnalyticsEnabledEventFunctions.setValue;

/** Gets the isAnalyticsEnabled for Connect. */
export const useIsAnalyticsEnabled = isAnalyticsEnabledEventFunctions.useValue;

/** Adds an event handler for when the isAnalyticsEnabled for Connect changes. */
export const addIsAnalyticsEnabledEventHandler =
  isAnalyticsEnabledEventFunctions.addEventHandler;

const isAnalyticsExternalProcessorsEnabled = makePHEventFunctions(
  "isAnalyticsExternalProcessorsEnabled",
);

/** Sets the isAnalyticsExternalProcessorsEnabled for Connect. */
export const setIsAnalyticsExternalProcessorsEnabled =
  isAnalyticsExternalProcessorsEnabled.setValue;

/** Gets the isAnalyticsExternalProcessorsEnabled for Connect. */
export const useIsAnalyticsExternalProcessorsEnabled =
  isAnalyticsExternalProcessorsEnabled.useValue;

/** Adds an event handler for when the isAnalyticsExternalProcessorsEnabled for Connect changes. */
export const addIsAnalyticsExternalProcessorsEnabledEventHandler =
  isAnalyticsExternalProcessorsEnabled.addEventHandler;

const analyticsDatabaseNameEventFunctions = makePHEventFunctions(
  "analyticsDatabaseName",
);

/** Sets the analytics database name for Connect. */
export const setAnalyticsDatabaseName =
  analyticsDatabaseNameEventFunctions.setValue;

/** Gets the analytics database name for Connect. */
export const useAnalyticsDatabaseName =
  analyticsDatabaseNameEventFunctions.useValue;

/** Adds an event handler for when the analytics database name for Connect changes. */
export const addAnalyticsDatabaseNameEventHandler =
  analyticsDatabaseNameEventFunctions.addEventHandler;

const logLevelEventFunctions = makePHEventFunctions("logLevel");

/** Sets the log level for Connect. */
export const setLogLevel = logLevelEventFunctions.setValue;

/** Gets the log level for Connect. */
export const useLogLevel = logLevelEventFunctions.useValue;

/** Adds an event handler for when the log level for Connect changes. */
export const addLogLevelEventHandler = logLevelEventFunctions.addEventHandler;

const allowListEventFunctions = makePHEventFunctions("allowList");

/** Sets the allow list for Connect. */
export const setAllowList = allowListEventFunctions.setValue;

/** Gets the allow list for Connect. */
export const useAllowList = allowListEventFunctions.useValue;

/** Adds an event handler for when the allow list for Connect changes. */
export const addAllowListEventHandler = allowListEventFunctions.addEventHandler;

type NonUserConfigKey = Exclude<
  PHGlobalConfigKey,
  PHDriveEditorConfigKey | PHDocumentEditorConfigKey
>;
type NonUserConfigSetters = PHGlobalConfigSettersForKey<NonUserConfigKey>;
type NonUserConfigHooks = PHGlobalConfigHooksForKey<NonUserConfigKey>;

const nonUserConfigSetters: NonUserConfigSetters = {
  routerBasename: setRouterBasename,
  version: setVersion,
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
  defaultDrivesUrl: setDefaultDrivesUrl,
  drivesPreserveStrategy: setDrivesPreserveStrategy,
  isLocalDrivesEnabled: setIsLocalDrivesEnabled,
  isAddDriveEnabled: setIsAddDriveEnabled,
  isPublicDrivesEnabled: setIsPublicDrivesEnabled,
  isAddPublicDrivesEnabled: setIsAddPublicDrivesEnabled,
  isDeletePublicDrivesEnabled: setIsDeletePublicDrivesEnabled,
  isCloudDrivesEnabled: setIsCloudDrivesEnabled,
  isAddCloudDrivesEnabled: setIsAddCloudDrivesEnabled,
  isDeleteCloudDrivesEnabled: setIsDeleteCloudDrivesEnabled,
  isAddLocalDrivesEnabled: setIsAddLocalDrivesEnabled,
  isDeleteLocalDrivesEnabled: setIsDeleteLocalDrivesEnabled,
  isEditorDebugModeEnabled: setIsEditorDebugModeEnabled,
  isEditorReadModeEnabled: setIsEditorReadModeEnabled,
  isRelationalProcessorsEnabled: setIsRelationalProcessorsEnabled,
  isExternalRelationalProcessorsEnabled:
    setIsExternalRelationalProcessorsEnabled,
  isAnalyticsEnabled: setIsAnalyticsEnabled,
  analyticsDatabaseName: setAnalyticsDatabaseName,
  isAnalyticsExternalProcessorsEnabled: setIsAnalyticsExternalProcessorsEnabled,
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
  allowList: setAllowList,
  logLevel: setLogLevel,
  disabledEditors: setDisabledEditors,
  enabledEditors: setEnabledEditors,
};

export const phGlobalConfigSetters: PHGlobalConfigSetters = {
  ...phDriveEditorConfigSetters,
  ...phDocumentEditorConfigSetters,
  ...nonUserConfigSetters,
};

const nonUserConfigHooks: NonUserConfigHooks = {
  routerBasename: useRouterBasename,
  version: useVersion,
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
  defaultDrivesUrl: useDefaultDrivesUrl,
  drivesPreserveStrategy: useDrivesPreserveStrategy,
  isAddDriveEnabled: useIsAddDriveEnabled,
  isPublicDrivesEnabled: useIsPublicDrivesEnabled,
  isAddPublicDrivesEnabled: useIsAddPublicDrivesEnabled,
  isDeletePublicDrivesEnabled: useIsDeletePublicDrivesEnabled,
  isCloudDrivesEnabled: useIsCloudDrivesEnabled,
  isAddCloudDrivesEnabled: useIsAddCloudDrivesEnabled,
  isDeleteCloudDrivesEnabled: useIsDeleteCloudDrivesEnabled,
  isLocalDrivesEnabled: useIsLocalDrivesEnabled,
  isAddLocalDrivesEnabled: useIsAddLocalDrivesEnabled,
  isDeleteLocalDrivesEnabled: useIsDeleteLocalDrivesEnabled,
  isEditorDebugModeEnabled: useIsEditorDebugModeEnabled,
  isEditorReadModeEnabled: useIsEditorReadModeEnabled,
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
  allowList: useAllowList,
  isAnalyticsEnabled: useIsAnalyticsEnabled,
  isAnalyticsExternalProcessorsEnabled: useIsAnalyticsExternalProcessorsEnabled,
  isRelationalProcessorsEnabled: useIsRelationalProcessorsEnabled,
  isExternalRelationalProcessorsEnabled:
    useIsExternalRelationalProcessorsEnabled,
  analyticsDatabaseName: useAnalyticsDatabaseName,
  logLevel: useLogLevel,
  disabledEditors: useDisabledEditors,
  enabledEditors: useEnabledEditors,
};

export const phGlobalConfigHooks: PHGlobalConfigHooks = {
  ...phDriveEditorConfigHooks,
  ...phDocumentEditorConfigHooks,
  ...nonUserConfigHooks,
};
