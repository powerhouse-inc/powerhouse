/**
 * This is a scaffold file meant for customization:
 * - modify it by implementing the reducer functions
 * - delete the file and run the code generator again to have it reset
 */

import { FileNode } from '../..';
import { DocumentDriveNodeOperations } from '../../gen/node/operations';

export const reducer: DocumentDriveNodeOperations = {
    addFileOperation(state, action) {
        const drive = state.drives.find(
            drive => drive.id === action.input.drive,
        );
        drive?.nodes.push({ ...action.input, kind: 'file' });
    },
    addFolderOperation(state, action) {
        const drive = state.drives.find(
            drive => drive.id === action.input.drive,
        );
        drive?.nodes.push({ ...action.input, kind: 'folder' });
    },
    deleteNodeOperation(state, action) {
        const drive = state.drives.find(
            drive => drive.id === action.input.drive,
        );
        if (drive) {
            drive.nodes = drive.nodes.filter(
                node => node.path !== action.input.path,
            );
        }
    },
    updateFileOperation(state, action) {
        const drive = state.drives.find(
            drive => drive.id === action.input.drive,
        );
        if (drive) {
            drive.nodes = drive.nodes.map(node =>
                node.path === action.input.path
                    ? {
                          ...node,
                          ...{
                              path: action.input.path ?? node.path,
                              hash: action.input.hash ?? node.hash,
                              name: action.input.name ?? node.name,
                              documentType:
                                  action.input.documentType ??
                                  (node as FileNode).documentType,
                          },
                      }
                    : node,
            );
        }
    },
    updateNodeOperation(state, action) {
        const drive = state.drives.find(
            drive => drive.id === action.input.drive,
        );
        if (drive) {
            drive.nodes = drive.nodes.map(node =>
                node.path === action.input.path
                    ? {
                          ...node,
                          ...{
                              hash: action.input.hash ?? node.hash,
                              name: action.input.name ?? node.name,
                          },
                      }
                    : node,
            );
        }
    },
    copyNodeOperation(state, action) {
        // TODO: Implement "copyNodeOperation" reducer
        throw new Error('Reducer "copyNodeOperation" not yet implemented');
    },
};
