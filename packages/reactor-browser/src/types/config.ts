export type PHGlobalConfig = PHCommonGlobalConfig &
  PHDrivesGlobalConfig &
  PHEditorsGlobalConfig &
  PHAnalyticsGlobalConfig &
  PHRenownGlobalConfig &
  PHSentryGlobalConfig &
  PHProcessorsGlobalConfig;

/** Helper type for ensuring keys are all present while still allowing them to be set */
export type FullPHGlobalConfig = Record<PHGlobalConfigKey, PHGlobalConfigValue>;

export type PHGlobalConfigKey = keyof PHGlobalConfig;
export type PHGlobalConfigValue = PHGlobalConfig[PHGlobalConfigKey];
export type PHGlobalConfigSetters<
  T extends PHGlobalConfigKey = PHGlobalConfigKey,
> = {
  [K in T]: (value: PHGlobalConfig[K]) => void;
};
export type PHGlobalConfigHooks<
  TKey extends PHGlobalConfigKey = PHGlobalConfigKey,
> = {
  [K in TKey]: () => PHGlobalConfig[K];
};
export type PHCommonGlobalConfig = {
  basePath?: string;
  routerBasename?: string;
  version?: string;
  logLevel?: "debug" | "info" | "warn" | "error";
  requiresHardRefresh?: boolean;
  warnOutdatedApp?: boolean;
  studioMode?: boolean;
  versionCheckInterval?: number;
  cliVersion?: string;
  fileUploadOperationsChunkSize?: number;
  isDocumentModelSelectionSettingsEnabled?: boolean;
  gaTrackingId?: string;
  allowList?: string[];
};

export type PHDrivesGlobalConfig = {
  defaultDrivesUrl?: string;
  drivesPreserveStrategy?: string;
  allowedDocumentTypes?: string[];
  enabledEditors?: string[];
  disabledEditors?: string[];
  isAddDriveEnabled?: boolean;
  isPublicDrivesEnabled?: boolean;
  isAddPublicDrivesEnabled?: boolean;
  isDeletePublicDrivesEnabled?: boolean;
  isCloudDrivesEnabled?: boolean;
  isAddCloudDrivesEnabled?: boolean;
  isDeleteCloudDrivesEnabled?: boolean;
  localDrivesEnabled?: boolean;
  isAddLocalDrivesEnabled?: boolean;
  isDeleteLocalDrivesEnabled?: boolean;
  isSearchBarEnabled?: boolean;
  isDragAndDropEnabled?: boolean;
};

export type PHEditorsGlobalConfig = {
  isExternalControlsEnabled?: boolean;
  isDocumentToolbarEnabled?: boolean;
  isSwitchboardLinkEnabled?: boolean;
  isTimelineEnabled?: boolean;
  isEditorDebugModeEnabled?: boolean;
  isEditorReadModeEnabled?: boolean;
};

export type PHAnalyticsGlobalConfig = {
  analyticsDatabaseName?: string;
  isAnalyticsDatabaseWorkerEnabled?: boolean;
  isDiffAnalyticsEnabled?: boolean;
  isDriveAnalyticsEnabled?: boolean;
};

export type PHRenownGlobalConfig = {
  renownUrl?: string;
  renownNetworkId?: string;
  renownChainId?: number;
};

export type PHSentryGlobalConfig = {
  sentryRelease?: string;
  sentryDsn?: string;
  sentryEnv?: string;
  isSentryTracingEnabled?: boolean;
};

export type PHProcessorsGlobalConfig = {
  isExternalProcessorsEnabled?: boolean;
  isExternalPackagesEnabled?: boolean;
};
