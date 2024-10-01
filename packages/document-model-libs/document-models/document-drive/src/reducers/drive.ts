/**
 * This is a scaffold file meant for customization:
 * - modify it by implementing the reducer functions
 * - delete the file and run the code generator again to have it reset
 */

import { DocumentDriveDriveOperations } from '../../gen/drive/operations';

export const reducer: DocumentDriveDriveOperations = {
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
        if (
            state.listeners.find(
                (listener) =>
                    listener.listenerId === action.input.listener.listenerId,
            )
        ) {
            throw new Error(
                `A listener with Id: ${action.input.listener.listenerId} already exists`,
            );
        }
        state.listeners.push(action.input.listener);
    },
    removeListenerOperation(state, action, dispatch) {
        state.listeners = state.listeners.filter(
            (listener) => listener.listenerId !== action.input.listenerId,
        );
    },
    addTriggerOperation(state, action, dispatch) {
        if (
            state.triggers.find(
                (trigger) => trigger.id === action.input.trigger.id,
            )
        ) {
            throw new Error(
                `A trigger with Id: ${action.input.trigger.id} already exists`,
            );
        }
        state.triggers.push(action.input.trigger);
    },
    removeTriggerOperation(state, action, dispatch) {
        state.triggers = state.triggers.filter(
            (trigger) => trigger.id !== action.input.triggerId,
        );
    },
};
