export type PHGlobalConfig = PHCommonGlobalConfig &
  PHDriveEditorConfig &
  PHDocumentEditorConfig &
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
 * Editor configuration settings which are globally available to your custom drive editors.
 *
 * Setting these will override the defaults when your editor is mounted.
 */
export type PHDriveEditorConfig = {
  /** Allows you to specify the document types that are allowed to be added to the drive.
   * An empty array means that any document type is allowed.
   */
  allowedDocumentTypes?: string[];
  /** Whether drag and drop is enabled for the drive editor. */
  isDragAndDropEnabled?: boolean;
};
export type PHDriveEditorConfigKey = keyof PHDriveEditorConfig;
export type PHDriveEditorConfigSetters =
  PHGlobalConfigSettersForKey<PHDriveEditorConfigKey>;
export type PHDriveEditorConfigHooks =
  PHGlobalConfigHooksForKey<PHDriveEditorConfigKey>;

export type PHDocumentEditorConfig = {
  /** Whether external controls are enabled for the document editor. */
  isExternalControlsEnabled?: boolean;
};
export type PHDocumentEditorConfigKey = keyof PHDocumentEditorConfig;
export type PHDocumentEditorConfigSetters =
  PHGlobalConfigSettersForKey<PHDocumentEditorConfigKey>;
export type PHDocumentEditorConfigHooks =
  PHGlobalConfigHooksForKey<PHDocumentEditorConfigKey>;

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
