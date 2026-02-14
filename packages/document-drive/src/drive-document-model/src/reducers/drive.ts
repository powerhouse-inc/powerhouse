/**
 * This is a scaffold file meant for customization:
 * - modify it by implementing the reducer functions
 * - delete the file and run the code generator again to have it reset
 */

import type {
  DocumentDriveDriveOperations,
  Listener,
  Trigger,
} from "document-drive";

export const driveReducer: DocumentDriveDriveOperations = {
  setDriveNameOperation(state, action, dispatch) {
    state.name = action.input.name;
  },
  setDriveIconOperation(state, action, dispatch) {
    state.icon = action.input.icon;
  },
  setSharingTypeOperation(state, action, dispatch) {
    state.sharingType = action.input.type;
  },
  setAvailableOfflineOperation(state, action, dispatch) {
    state.availableOffline = action.input.availableOffline;
  },
  addListenerOperation(state, action, dispatch) {
    const { listener: input } = action.input;
    if (state.listeners.find((l) => l.listenerId === input.listenerId)) {
      throw new Error(`A listener with Id: ${input.listenerId} already exists`);
    }
    // Convert InputMaybe (undefined | null | T) to Maybe (null | T)
    const listener: Listener = {
      listenerId: input.listenerId,
      label: input.label ?? null,
      block: input.block,
      system: input.system,
      filter: {
        documentType: input.filter.documentType ?? null,
        documentId: input.filter.documentId ?? null,
        scope: input.filter.scope ?? null,
        branch: input.filter.branch ?? null,
      },
      callInfo: input.callInfo
        ? {
            transmitterType: input.callInfo.transmitterType ?? null,
            name: input.callInfo.name ?? null,
            data: input.callInfo.data ?? null,
          }
        : null,
    };
    state.listeners.push(listener);
  },
  removeListenerOperation(state, action, dispatch) {
    state.listeners = state.listeners.filter(
      (listener) => listener.listenerId !== action.input.listenerId,
    );
  },
  addTriggerOperation(state, action, dispatch) {
    const { trigger: input } = action.input;
    if (state.triggers.find((t) => t.id === input.id)) {
      throw new Error(`A trigger with Id: ${input.id} already exists`);
    }
    // Convert InputMaybe to Maybe - PullResponderTriggerData has all required fields so spread works
    const trigger: Trigger = {
      id: input.id,
      type: input.type,
      data: input.data ? { ...input.data } : null,
    };
    state.triggers.push(trigger);
  },
  removeTriggerOperation(state, action, dispatch) {
    state.triggers = state.triggers.filter(
      (trigger) => trigger.id !== action.input.triggerId,
    );
  },
};
