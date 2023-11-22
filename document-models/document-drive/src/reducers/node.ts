/**
 * This is a scaffold file meant for customization:
 * - modify it by implementing the reducer functions
 * - delete the file and run the code generator again to have it reset
 */

import { FileNode, getDescendants, isFileNode } from '../..';
import { DocumentDriveNodeOperations } from '../../gen/node/operations';

export const reducer: DocumentDriveNodeOperations = {
    addFileOperation(state, action, dispatch) {
        if (state.nodes.find(node => node.id === action.input.id)) {
            throw new Error(`Node with id ${action.input.id} already exists!`);
        }

        state.nodes.push({
            ...action.input,
            kind: 'file',
            parentFolder: action.input.parentFolder ?? null,
        });

        dispatch?.({
            type: 'CREATE_CHILD_DOCUMENT',
            input: {
                id: action.input.id,
                documentType: action.input.documentType,
            },
        });
    },
    addFolderOperation(state, action) {
        if (state.nodes.find(node => node.id === action.input.id)) {
            throw new Error(`Node with id ${action.input.id} already exists!`);
        }
        state.nodes.push({
            ...action.input,
            kind: 'folder',
            parentFolder: action.input.parentFolder ?? null,
        });
    },
    deleteNodeOperation(state, action, dispatch) {
        const node = state.nodes.find(node => node.id === action.input.id);
        if (!node) {
            throw new Error(`Node with id ${action.input.id} not found`);
        }
        const descendants = getDescendants(node, state.nodes);
        state.nodes = state.nodes.filter(
            node =>
                node.id !== action.input.id &&
                !descendants.find(descendant => descendant.id === node.id),
        );

        [node, ...descendants]
            .filter(node => isFileNode(node))
            .forEach(node => {
                dispatch?.({
                    type: 'DELETE_CHILD_DOCUMENT',
                    input: {
                        id: node.id,
                    },
                });
            });
    },
    updateFileOperation(state, action) {
        state.nodes = state.nodes.map(node =>
            node.id === action.input.id
                ? {
                      ...node,
                      ...{
                          name: action.input.name ?? node.name,
                          documentType:
                              action.input.documentType ??
                              (node as FileNode).documentType,
                      },
                  }
                : node,
        );
    },
    updateNodeOperation(state, action) {
        state.nodes = state.nodes.map(node =>
            node.id === action.input.id
                ? {
                      ...node,
                      ...{
                          name: action.input.name ?? node.name,
                          parentFolder:
                              action.input.parentFolder === null
                                  ? null
                                  : node.parentFolder,
                      },
                  }
                : node,
        );
    },
    copyNodeOperation(state, action) {
        // TODO: Implement "copyNodeOperation" reducer
        throw new Error('Reducer "copyNodeOperation" not yet implemented');
    },
    moveNodeOperation(state, action) {
        // TODO: Implement "moveNodeOperation" reducer
        throw new Error('Reducer "moveNodeOperation" not yet implemented');
    },
};
