/**
 * This is a scaffold file meant for customization:
 * - modify it by implementing the reducer functions
 * - delete the file and run the code generator again to have it reset
 */

import {
    CreateChildDocumentInput,
    SynchronizationUnit,
} from 'document-model/document';
import { FileNode, getDescendants, isFileNode, isFolderNode } from '../..';
import { DocumentDriveNodeOperations } from '../../gen/node/operations';

export const reducer: DocumentDriveNodeOperations = {
    addFileOperation(state, action, dispatch) {
        if (state.nodes.find(node => node.id === action.input.id)) {
            throw new Error(`Node with id ${action.input.id} already exists!`);
        }

        const synchronizationUnits = action.input
            .synchronizationUnits as SynchronizationUnit[];

        const invalidSyncUnit: SynchronizationUnit | undefined =
            synchronizationUnits.find(
                unit =>
                    !!state.nodes.find(
                        node =>
                            isFileNode(node) &&
                            node.synchronizationUnits.find(
                                fileUnit => fileUnit.syncId === unit.syncId,
                            ),
                    ),
            );
        if (invalidSyncUnit) {
            throw new Error(
                `A synchronization unit with Id ${invalidSyncUnit.syncId} already exists`,
            );
        }
        const fileNode: FileNode = {
            ...action.input,
            kind: 'file',
            parentFolder: action.input.parentFolder ?? null,
            synchronizationUnits,
        };
        state.nodes.push(fileNode);

        dispatch?.({
            type: 'CREATE_CHILD_DOCUMENT',
            input: {
                id: action.input.id,
                documentType: action.input.documentType,
                synchronizationUnits,
                document: action.input
                    .document as CreateChildDocumentInput['document'],
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
    copyNodeOperation(state, action, dispatch) {
        const node = state.nodes.find(node => node.id === action.input.srcId);

        if (!node) {
            throw new Error(`Node with id ${action.input.srcId} not found`);
        }

        const newNode = {
            ...node,
            id: action.input.targetId,
            name: action.input.targetName || node.name,
            parentFolder: action.input.targetParentFolder || null,
        };

        const isFile = isFileNode(newNode);

        if (isFile) {
            const synchronizationUnits = action.input
                .synchronizationUnits as SynchronizationUnit[];

            if (!action.input.synchronizationUnits) {
                throw new Error('Synchronization units were not provided');
            }

            const invalidSyncUnit: SynchronizationUnit | undefined =
                synchronizationUnits.find(
                    unit =>
                        !!state.nodes.find(
                            node =>
                                isFileNode(node) &&
                                node.synchronizationUnits.find(
                                    fileUnit => fileUnit.syncId === unit.syncId,
                                ),
                        ),
                );
            if (invalidSyncUnit) {
                throw new Error(
                    `A synchronization unit with Id ${invalidSyncUnit.syncId} already exists`,
                );
            }

            newNode.synchronizationUnits = synchronizationUnits;
        }

        state.nodes.push(newNode);

        if (isFile) {
            dispatch?.({
                type: 'COPY_CHILD_DOCUMENT',
                input: {
                    id: action.input.srcId,
                    newId: action.input.targetId,
                    synchronizationUnits:
                        newNode.synchronizationUnits as SynchronizationUnit[],
                },
            });
        }
    },
    moveNodeOperation(state, action) {
        const node = state.nodes.find(
            node => node.id === action.input.srcFolder,
        );

        if (!node) {
            throw new Error(`Node with id ${action.input.srcFolder} not found`);
        }

        if (isFolderNode(node)) {
            if (action.input.srcFolder === action.input.targetParentFolder) {
                throw new Error(
                    'Circular Reference Error: Cannot make folder its own parent',
                );
            }
            const descendants = getDescendants(node, state.nodes);
            // throw error if moving a folder to one of its descendants
            if (
                descendants.find(
                    descendant =>
                        descendant.id === action.input.targetParentFolder,
                )
            ) {
                throw new Error(
                    'Circular Reference Error: Cannot move a folder to one of its descendants',
                );
            }
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
};
