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
    setSharingTypeOperation(state, action, dispatch) {
        state.sharingType = action.input.type
    },
    setAvailableOfflineOperation(state, action, dispatch) {
        state.availableOffline = action.input.availableOffline;
    },
}