import { Document } from 'document-model';
import {
    DocumentDriveAction,
    DocumentDriveLocalState,
    DocumentDriveState,
    FileNode,
    actions,
    generateSynchronizationUnits,
    reducer,
    utils,
} from '../..';

describe('DocumentDrive Actions', () => {
    let documentDrive: Document.Document<
        DocumentDriveState,
        DocumentDriveAction,
        DocumentDriveLocalState
    >;

    beforeEach(() => {
        documentDrive = utils.createDocument();

        documentDrive = reducer(
            documentDrive,
            actions.addFolder({
                id: '1',
                name: 'Folder 1',
            }),
        );

        documentDrive = reducer(
            documentDrive,
            actions.addFolder({
                id: '1.1',
                name: 'Folder 1.1',
                parentFolder: '1',
            }),
        );

        documentDrive = reducer(
            documentDrive,
            actions.addFolder({
                id: '1.1.1',
                name: 'Folder 1.1.1',
                parentFolder: '1.1',
            }),
        );

        documentDrive = reducer(
            documentDrive,
            actions.addFolder({
                id: '2',
                name: 'Folder 2',
            }),
        );

        documentDrive = reducer(
            documentDrive,
            actions.addFolder({
                id: '3',
                name: 'Folder 3',
            }),
        );
    });

    describe('moveNode', () => {
        it('should move a node to a different parent', () => {
            const srcFolder = '1.1';
            const targetParentFolder = '2';

            documentDrive = reducer(
                documentDrive,
                actions.moveNode({
                    srcFolder,
                    targetParentFolder,
                }),
            );

            const movedNode = documentDrive.state.global.nodes.find(
                node => node.id === srcFolder,
            );

            expect(movedNode?.parentFolder).toBe(targetParentFolder);
        });

        it('should move a node to the root of the drive when parentFolder is not provided', () => {
            const srcFolder = '1.1';

            documentDrive = reducer(
                documentDrive,
                actions.moveNode({
                    srcFolder,
                }),
            );

            const movedNode = documentDrive.state.global.nodes.find(
                node => node.id === srcFolder,
            );

            expect(movedNode?.parentFolder).toBe(null);
        });

        it('should move a node to the root of the drive when parentFolder is null', () => {
            const srcFolder = '1.1';

            documentDrive = reducer(
                documentDrive,
                actions.moveNode({
                    srcFolder,
                    targetParentFolder: null,
                }),
            );

            const movedNode = documentDrive.state.global.nodes.find(
                node => node.id === srcFolder,
            );

            expect(movedNode?.parentFolder).toBe(null);
        });

        it('should throw an error when the srcFolder node does not exist', () => {
            const srcFolder = 'invalid';
            const targetParentFolder = '2';

            expect(() =>
                reducer(
                    documentDrive,
                    actions.moveNode({
                        srcFolder,
                        targetParentFolder,
                    }),
                ),
            ).toThrowError(`Node with id ${srcFolder} not found`);
        });
    });

    describe('copyNode', () => {
        it('should copy a node to a different parent', () => {
            const srcId = '1.1';
            const targetId = '1.1-copy';
            const targetParentFolder = '2';
            const initialNodesLength = documentDrive.state.global.nodes.length;

            documentDrive = reducer(
                documentDrive,
                actions.copyNode({
                    srcId,
                    targetId,
                    targetParentFolder,
                }),
            );

            const copiedNode = documentDrive.state.global.nodes.find(
                node => node.id === targetId,
            );

            expect(documentDrive.state.global.nodes.length).toBe(
                initialNodesLength + 1,
            );
            expect(copiedNode?.parentFolder).toBe(targetParentFolder);
        });

        it('should copy a node to the root of the drive when parentFolder is not provided', () => {
            const srcId = '1.1';
            const targetId = '1.1-copy';
            const initialNodesLength = documentDrive.state.global.nodes.length;

            documentDrive = reducer(
                documentDrive,
                actions.copyNode({
                    srcId,
                    targetId,
                }),
            );

            const copiedNode = documentDrive.state.global.nodes.find(
                node => node.id === targetId,
            );

            expect(documentDrive.state.global.nodes.length).toBe(
                initialNodesLength + 1,
            );
            expect(copiedNode?.parentFolder).toBe(null);
        });

        it('should copy a node to the root of the drive when parentFolder is null', () => {
            const srcId = '1.1';
            const targetId = '1.1-copy';
            const initialNodesLength = documentDrive.state.global.nodes.length;

            documentDrive = reducer(
                documentDrive,
                actions.copyNode({
                    srcId,
                    targetId,
                    targetParentFolder: null,
                }),
            );

            const copiedNode = documentDrive.state.global.nodes.find(
                node => node.id === targetId,
            );

            expect(documentDrive.state.global.nodes.length).toBe(
                initialNodesLength + 1,
            );
            expect(copiedNode?.parentFolder).toBe(null);
        });

        it('should throw an error when the srcId node does not exist', () => {
            const srcId = 'invalid';
            const targetId = '1.1-copy';
            const targetParentFolder = '2';

            expect(() =>
                reducer(
                    documentDrive,
                    actions.copyNode({
                        srcId,
                        targetId,
                        targetParentFolder,
                    }),
                ),
            ).toThrowError(`Node with id ${srcId} not found`);
        });

        it('should copy a node when a new name when targetName is provided', () => {
            const srcId = '1.1';
            const targetId = '1.1-copy';
            const targetName = 'New Name';
            const targetParentFolder = '2';
            const initialNodesLength = documentDrive.state.global.nodes.length;

            documentDrive = reducer(
                documentDrive,
                actions.copyNode({
                    srcId,
                    targetId,
                    targetName,
                    targetParentFolder,
                }),
            );

            const copiedNode = documentDrive.state.global.nodes.find(
                node => node.id === targetId,
            );

            expect(documentDrive.state.global.nodes.length).toBe(
                initialNodesLength + 1,
            );
            expect(copiedNode?.name).toBe(targetName);
            expect(copiedNode?.parentFolder).toBe(targetParentFolder);
        });

        it('should copy a node with src name if targetName is not provided', () => {
            const srcId = '1.1';
            const targetId = '1.1-copy';
            const targetParentFolder = '2';
            const initialNodesLength = documentDrive.state.global.nodes.length;

            documentDrive = reducer(
                documentDrive,
                actions.copyNode({
                    srcId,
                    targetId,
                    targetParentFolder,
                }),
            );

            const copiedNode = documentDrive.state.global.nodes.find(
                node => node.id === targetId,
            );

            expect(documentDrive.state.global.nodes.length).toBe(
                initialNodesLength + 1,
            );
            expect(copiedNode?.name).toBe('Folder 1.1');
            expect(copiedNode?.parentFolder).toBe(targetParentFolder);
        });

        it('should copy a node with src name if targetName is null', () => {
            const srcId = '1.1';
            const targetId = '1.1-copy';
            const targetParentFolder = '2';
            const initialNodesLength = documentDrive.state.global.nodes.length;

            documentDrive = reducer(
                documentDrive,
                actions.copyNode({
                    srcId,
                    targetId,
                    targetName: null,
                    targetParentFolder,
                }),
            );

            const copiedNode = documentDrive.state.global.nodes.find(
                node => node.id === targetId,
            );

            expect(documentDrive.state.global.nodes.length).toBe(
                initialNodesLength + 1,
            );
            expect(copiedNode?.name).toBe('Folder 1.1');
            expect(copiedNode?.parentFolder).toBe(targetParentFolder);
        });

        it('should set sync units when copying a file node', () => {
            const synchronizationUnits = generateSynchronizationUnits(
                documentDrive.state.global,
                ['global', 'local'],
            );

            documentDrive = reducer(
                documentDrive,
                actions.addFile({
                    id: 'testFile',
                    documentType: '',
                    name: 'Test File',
                    synchronizationUnits,
                }),
            );

            const initialNodesLength = documentDrive.state.global.nodes.length;

            const newSynchronizationUnits = generateSynchronizationUnits(
                documentDrive.state.global,
                ['global', 'local'],
            );
            documentDrive = reducer(
                documentDrive,
                actions.copyNode({
                    srcId: 'testFile',
                    targetId: 'testFile-copy',
                    targetName: null,
                    synchronizationUnits: newSynchronizationUnits,
                }),
            );

            const copiedNode = documentDrive.state.global.nodes.find(
                node => node.id === 'testFile-copy',
            );

            expect(documentDrive.state.global.nodes.length).toBe(
                initialNodesLength + 1,
            );
            expect((copiedNode as FileNode).synchronizationUnits).toStrictEqual(
                newSynchronizationUnits,
            );
            expect(newSynchronizationUnits).to.not.toStrictEqual(
                synchronizationUnits,
            );
        });
    });
});
