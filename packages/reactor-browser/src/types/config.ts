export type PHGlobalConfig = PHCommonGlobalConfig &
  PHGlobalEditorConfig &
  PHDrivesGlobalConfig &
  PHAnalyticsGlobalConfig &
  PHRenownGlobalConfig &
  PHSentryGlobalConfig &
  PHProcessorsGlobalConfig;

export type PHGlobalConfigKey = keyof PHGlobalConfig;
export type PHGlobalConfigSetters =
  PHGlobalConfigSettersForKey<PHGlobalConfigKey>;
export type PHGlobalConfigHooks = PHGlobalConfigHooksForKey<PHGlobalConfigKey>;

/**
 * Editor configuration settings which are globally available to your custom editors.
 *
 * Setting these will override the defaults when your editor is mounted.
 */
export type PHGlobalEditorConfig = {
  /** Used for drive editors, allows you to specify the document types that are allowed to be added to the drive. */
  allowedDocumentTypes?: string[];
  /** Whether external controls are enabled for the editor. Defaults to `true`. */
  isExternalControlsEnabled?: boolean;
  /** Whether drag and drop is enabled for the editor. Defaults to `false`. */
  isDragAndDropEnabled?: boolean;
};
export type PHGlobalEditorConfigKey = keyof PHGlobalEditorConfig;
export type PHGlobalEditorConfigSetters =
  PHGlobalConfigSettersForKey<PHGlobalEditorConfigKey>;
export type PHGlobalEditorConfigHooks =
  PHGlobalConfigHooksForKey<PHGlobalEditorConfigKey>;

export type PHCommonGlobalConfig = {
  basePath?: string;
  routerBasename?: string;
  version?: string;
  requiresHardRefresh?: boolean;
  warnOutdatedApp?: boolean;
  studioMode?: boolean;
  versionCheckInterval?: number;
  cliVersion?: string;
  fileUploadOperationsChunkSize?: number;
  gaTrackingId?: string;
  isDocumentModelSelectionSettingsEnabled?: boolean;
  isAddDriveEnabled?: boolean;
  isPublicDrivesEnabled?: boolean;
  isAddPublicDrivesEnabled?: boolean;
  isDeletePublicDrivesEnabled?: boolean;
  isCloudDrivesEnabled?: boolean;
  isAddCloudDrivesEnabled?: boolean;
  isDeleteCloudDrivesEnabled?: boolean;
  isLocalDrivesEnabled?: boolean;
  isAddLocalDrivesEnabled?: boolean;
  isDeleteLocalDrivesEnabled?: boolean;
  allowList?: string[];
  analyticsDatabaseName?: string;
  logLevel?: "debug" | "info" | "warn" | "error";
  isEditorDebugModeEnabled?: boolean;
  isEditorReadModeEnabled?: boolean;
  disabledEditors?: string[];
  enabledEditors?: string[];
};

export type PHDrivesGlobalConfig = {
  defaultDrivesUrl?: string;
  drivesPreserveStrategy?: string;
};

export type PHAnalyticsGlobalConfig = {
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

export type PHGlobalConfigSettersForKey<T extends PHGlobalConfigKey> = {
  [K in T]: (value: PHGlobalConfig[K]) => void;
};
export type PHGlobalConfigHooksForKey<TKey extends PHGlobalConfigKey> = {
  [K in TKey]: () => PHGlobalConfig[K];
};
/** Helper type for ensuring keys are all present while still allowing them to be set */
export type FullPHGlobalConfig = Record<
  PHGlobalConfigKey,
  PHGlobalConfig[PHGlobalConfigKey]
>;
