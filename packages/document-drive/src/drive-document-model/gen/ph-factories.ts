/**
 * Factory methods for creating DocumentDriveDocument instances
 */

import {
  type DocumentDriveGlobalState,
  type DocumentDriveLocalState,
  type DocumentDrivePHState,
} from "document-drive";
import type { PHBaseState } from "document-model";
import { createBaseState, defaultBaseState } from "document-model";

export function defaultGlobalState(): DocumentDriveGlobalState {
  return {
    icon: null,
    name: "",
    nodes: [],
  };
}

export function defaultLocalState(): DocumentDriveLocalState {
  return {
    availableOffline: false,
    listeners: [],
    sharingType: null,
    triggers: [],
  };
}

export function defaultPHState(): DocumentDrivePHState {
  return {
    ...defaultBaseState(),
    global: defaultGlobalState(),
    local: defaultLocalState(),
  };
}

export function createGlobalState(
  state?: Partial<DocumentDriveGlobalState>,
): DocumentDriveGlobalState {
  return {
    ...defaultGlobalState(),
    ...(state || {}),
  } as DocumentDriveGlobalState;
}

export function createLocalState(
  state?: Partial<DocumentDriveLocalState>,
): DocumentDriveLocalState {
  return {
    ...defaultLocalState(),
    ...(state || {}),
  } as DocumentDriveLocalState;
}

export function createState(
  baseState?: Partial<PHBaseState>,
  globalState?: Partial<DocumentDriveGlobalState>,
  localState?: Partial<DocumentDriveLocalState>,
): DocumentDrivePHState {
  return {
    ...createBaseState(baseState?.auth, baseState?.document),
    global: createGlobalState(globalState),
    local: createLocalState(localState),
  };
}
