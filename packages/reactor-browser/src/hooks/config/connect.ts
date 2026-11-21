import type {
  PHAppConfigKey,
  PHDocumentEditorConfigKey,
  PHGlobalConfigHooks,
  PHGlobalConfigHooksForKey,
  PHGlobalConfigKey,
  PHGlobalConfigSetters,
  PHGlobalConfigSettersForKey,
} from "@powerhousedao/reactor-browser";
import { makePHEventFunctions } from "../make-ph-event-functions.js";
import {
  phAppConfigHooks,
  phAppConfigSetters,
  phDocumentEditorConfigHooks,
  phDocumentEditorConfigSetters,
} from "./editor.js";

export const {
  useValue: useRouterBasename,
  setValue: setRouterBasename,
  addEventHandler: addRouterBasenameEventHandler,
} = makePHEventFunctions("routerBasename");

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
  useValue: useDefaultDrivesUrl,
  setValue: setDefaultDrivesUrl,
  addEventHandler: addDefaultDrivesUrlEventHandler,
} = makePHEventFunctions("defaultDrivesUrl");

export const {
  useValue: useIsAddDriveEnabled,
  setValue: setIsAddDriveEnabled,
  addEventHandler: addIsAddDriveEnabledEventHandler,
} = makePHEventFunctions("isAddDriveEnabled");

export const {
  useValue: useRenownUrl,
  setValue: setRenownUrl,
  addEventHandler: addRenownUrlEventHandler,
} = makePHEventFunctions("renownUrl");

export const {
  useValue: useSwitchboardUrl,
  setValue: setSwitchboardUrl,
  addEventHandler: addSwitchboardUrlEventHandler,
} = makePHEventFunctions("switchboardUrl");

const disabledEditorsEventFunctions = makePHEventFunctions("disabledEditors");

/** Sets the disabled editors for Connect. */
export const setDisabledEditors = disabledEditorsEventFunctions.setValue;

/** Gets the disabled editors for Connect. */
export const useDisabledEditors = disabledEditorsEventFunctions.useValue;

/** Adds an event handler for when the disabled editors for Connect changes. */
export const addDisabledEditorsEventHandler =
  disabledEditorsEventFunctions.addEventHandler;

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
  PHAppConfigKey | PHDocumentEditorConfigKey
>;
type NonUserConfigSetters = PHGlobalConfigSettersForKey<NonUserConfigKey>;
type NonUserConfigHooks = PHGlobalConfigHooksForKey<NonUserConfigKey>;

const nonUserConfigSetters: NonUserConfigSetters = {
  routerBasename: setRouterBasename,
  warnOutdatedApp: setWarnOutdatedApp,
  studioMode: setStudioMode,
  basePath: setBasePath,
  defaultDrivesUrl: setDefaultDrivesUrl,
  isAddDriveEnabled: setIsAddDriveEnabled,
  renownUrl: setRenownUrl,
  switchboardUrl: setSwitchboardUrl,
  allowList: setAllowList,
  logLevel: setLogLevel,
  disabledEditors: setDisabledEditors,
};

export const phGlobalConfigSetters: PHGlobalConfigSetters = {
  ...phAppConfigSetters,
  ...phDocumentEditorConfigSetters,
  ...nonUserConfigSetters,
};

const nonUserConfigHooks: NonUserConfigHooks = {
  routerBasename: useRouterBasename,
  warnOutdatedApp: useWarnOutdatedApp,
  studioMode: useStudioMode,
  basePath: useBasePath,
  defaultDrivesUrl: useDefaultDrivesUrl,
  isAddDriveEnabled: useIsAddDriveEnabled,
  renownUrl: useRenownUrl,
  switchboardUrl: useSwitchboardUrl,
  allowList: useAllowList,
  logLevel: useLogLevel,
  disabledEditors: useDisabledEditors,
};

export const phGlobalConfigHooks: PHGlobalConfigHooks = {
  ...phAppConfigHooks,
  ...phDocumentEditorConfigHooks,
  ...nonUserConfigHooks,
};
