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

        const fileNode: FileNode = {
            ...action.input,
            kind: 'file',
            parentFolder: action.input.parentFolder ?? null,
            synchronizationUnits: []
        }
        state.nodes.push(fileNode);

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
            node => node.id !== action.input.id &&
                !descendants.find(descendant => descendant.id === node.id)
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
        state.nodes = state.nodes.map(node => node.id === action.input.id
            ? {
                ...node,
                ...{
                    name: action.input.name ?? node.name,
                    documentType: action.input.documentType ??
                        (node as FileNode).documentType,
                },
            }
            : node
        );
    },
    updateNodeOperation(state, action) {
        state.nodes = state.nodes.map(node => node.id === action.input.id
            ? {
                ...node,
                ...{
                    name: action.input.name ?? node.name,
                    parentFolder: action.input.parentFolder === null
                        ? null
                        : node.parentFolder,
                },
            }
            : node
        );
    },
    copyNodeOperation(state, action, dispatch) {
        const node = state.nodes.find(node => node.id === action.input.srcId);

        if (!node) {
            throw new Error(`Node with id ${action.input.srcId} not found`);
        }

        state.nodes.push({
            ...node,
            id: action.input.targetId,
            name: action.input.targetName || node.name,
            parentFolder: action.input.targetParentFolder || null,
        });

        if (isFileNode(node)) {
            dispatch?.({
                type: 'COPY_CHILD_DOCUMENT',
                input: {
                    id: action.input.srcId,
                    newId: action.input.targetId,
                },
            });
        }
    },
    moveNodeOperation(state, action) {
        const node = state.nodes.find(
            node => node.id === action.input.srcFolder
        );

        if (!node) {
            throw new Error(`Node with id ${action.input.srcFolder} not found`);
        }

        state.nodes = state.nodes.map(node => {
            if (node.id === action.input.srcFolder) {
                return {
                    ...node,
                    parentFolder: action.input.targetParentFolder || null,
                };
            }

            return node;
        });
    },
    addSynchronizationUnitOperation(state, action) {
        const { file, syncId, branch, scope } = action.input;
        
        const syncIdExists = state.nodes.find(node => isFileNode(node) && node.synchronizationUnits.find(unit => unit.syncId === syncId));
        if (syncIdExists) {
            throw new Error("Synchronization Id is not unique");
        }

        const node = state.nodes.find(node => node.id === file);
        if (!node  || !isFileNode(node)) {
            throw new Error("Node is not a file");
        }

        const unitExists = node.synchronizationUnits.find(unit => unit.scope === scope && unit.branch === branch)
        if (unitExists) {
            throw new Error(`There is a synchronization unit already defined with id: ${unitExists.syncId}`)
        }
        node.synchronizationUnits.push({syncId, branch, scope})
    },
    removeSynchronizationUnitOperation: function (state, action): void {
        const { file, syncId, branch, scope } = action.input;
        const node = state.nodes.find(node => node.id === file);

        if (!node  || !isFileNode(node)) {
            throw new Error("Node is not a file");
        }
        node.synchronizationUnits = node.synchronizationUnits.filter(unit => !(unit.syncId === syncId && unit.branch === branch && unit.scope === scope))
    }
};
