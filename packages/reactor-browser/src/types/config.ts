export type PHGlobalConfig = PHCommonGlobalConfig &
  PHAppConfig &
  PHDocumentEditorConfig &
  PHDrivesGlobalConfig &
  PHRenownGlobalConfig;

export type PHGlobalConfigKey = keyof PHGlobalConfig;
export type PHGlobalConfigSetters =
  PHGlobalConfigSettersForKey<PHGlobalConfigKey>;
export type PHGlobalConfigHooks = PHGlobalConfigHooksForKey<PHGlobalConfigKey>;

/**
 * Editor configuration settings which are globally available to your custom apps.
 *
 * Setting these will override the defaults when your editor is mounted.
 */
export type PHAppConfig = {
  /** Allows you to specify the document types that are allowed to be added to the drive.
   * An empty array means that any document type is allowed.
   */
  allowedDocumentTypes?: string[];
  /** Whether drag and drop is enabled for the app. */
  isDragAndDropEnabled?: boolean;
};
export type PHAppConfigKey = keyof PHAppConfig;
export type PHAppConfigSetters = PHGlobalConfigSettersForKey<PHAppConfigKey>;
export type PHAppConfigHooks = PHGlobalConfigHooksForKey<PHAppConfigKey>;

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
  warnOutdatedApp?: boolean;
  studioMode?: boolean;
  isAddDriveEnabled?: boolean;
  allowList?: string[];
  logLevel?: "debug" | "info" | "warn" | "error";
  disabledEditors?: string[];
};

export type PHDrivesGlobalConfig = {
  defaultDrivesUrl?: string;
};

export type PHRenownGlobalConfig = {
  renownUrl?: string;
  switchboardUrl?: string;
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
