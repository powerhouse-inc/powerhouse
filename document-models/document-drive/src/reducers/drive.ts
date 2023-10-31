/**
 * This is a scaffold file meant for customization:
 * - modify it by implementing the reducer functions
 * - delete the file and run the code generator again to have it reset
 */

import { DocumentDriveDriveOperations } from '../../gen/drive/operations';

export const reducer: DocumentDriveDriveOperations = {
    addDriveOperation(state, action) {
        state.drives.push(action.input);
    },
    updateDriveOperation(state, action) {
        state.drives = state.drives.map(drive =>
            drive.id === action.input.id
                ? {
                      id: action.input.id ?? drive.id,
                      hash: action.input.hash ?? drive.hash,
                      name: action.input.name ?? drive.name,
                      nodes: action.input.nodes ?? drive.nodes,
                  }
                : drive,
        );
    },
    deleteDriveOperation(state, action) {
        state.drives = state.drives.filter(
            drive => drive.id !== action.input.id,
        );
    },
};
