import { Signal } from 'document-model/document';
import {
    DocumentDrive,
    DocumentDriveDocument,
    FileNode,
    actions,
    reducer,
    utils,
} from '../..';

describe('DocumentDrive Class', () => {
    it('should rename drive', () => {
        let documentDrive = utils.createDocument();

        expect(documentDrive.state.global.name).toBe('');

        documentDrive = reducer(
            documentDrive,
            actions.setDriveName({
                name: 'new name',
            }),
        );

        expect(documentDrive.state.global.name).toBe('new name');
    });

    it('should delete children when node is deleted', () => {
        let documentDrive = utils.createDocument();
        documentDrive = reducer(
            documentDrive,
            actions.addFolder({
                id: '1',
                name: '1',
            }),
        );
        documentDrive = reducer(
            documentDrive,
            actions.addFolder({
                id: '1.1',
                name: '1.1',
                parentFolder: '1',
            }),
        );

        documentDrive = reducer(
            documentDrive,
            actions.deleteNode({
                id: '1',
            }),
        );

        expect(documentDrive.state.global.nodes.length).toBe(0);
    });

    it('should add file', () => {
        const documentDrive = new DocumentDrive(undefined);
        documentDrive.addFile({
            id: '1',
            documentType: 'test',
            name: 'document',
            scopes: ['global', 'local'],
        });

        expect(documentDrive.state.global.nodes).toStrictEqual([
            {
                id: '1',
                kind: 'file',
                parentFolder: null,
                documentType: 'test',
                name: 'document',
                scopes: ['global', 'local'],
                synchronizationUnits: [
                    {
                        syncId: '1',
                        scope: 'global',
                        branch: 'main',
                    },
                    {
                        syncId: '2',
                        scope: 'local',
                        branch: 'main',
                    },
                ],
            },
        ]);
    });

    it('should handle unsafe integer', () => {
        let drive = utils.createDocument();
        drive = reducer(
            drive,
            actions.addFile({
                id: '1',
                documentType: 'test',
                name: 'document',
                scopes: ['global', 'local'],
            }),
        );

        drive = JSON.parse(JSON.stringify(drive)) as DocumentDriveDocument;
        (
            drive.state.global.nodes[0] as FileNode
        ).synchronizationUnits[0].syncId = Number.MAX_SAFE_INTEGER.toString();

        drive = reducer(
            { ...drive },
            actions.addFile({
                id: '2',
                documentType: 'test',
                name: 'document',
                scopes: ['global', 'local'],
            }),
        );

        expect(drive.state.global.nodes[1]).toStrictEqual({
            id: '2',
            kind: 'file',
            parentFolder: null,
            documentType: 'test',
            name: 'document',
            scopes: ['global', 'local'],
            synchronizationUnits: [
                {
                    syncId: '9007199254740992',
                    scope: 'global',
                    branch: 'main',
                },
                {
                    syncId: '9007199254740993',
                    scope: 'local',
                    branch: 'main',
                },
            ],
        });
    });

    it('should trigger create child document signal', () => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        function dispatch(_signal: Signal) {}
        const documentDrive = new DocumentDrive(undefined, dispatch);
        // @ts-expect-error spying on private method
        const spy = vi.spyOn(documentDrive, '_signalDispatch');
        documentDrive.addFile({
            id: '1',
            documentType: 'test',
            name: 'document',
            scopes: ['global', 'local'],
        });

        expect(spy).toHaveBeenCalledOnce();
        expect(spy.mock.lastCall!.shift()).toStrictEqual({
            type: 'CREATE_CHILD_DOCUMENT',
            input: {
                id: '1',
                documentType: 'test',
                synchronizationUnits: [
                    {
                        branch: 'main',
                        scope: 'global',
                        syncId: '1',
                    },
                    {
                        branch: 'main',
                        scope: 'local',
                        syncId: '2',
                    },
                ],
            },
        });
    });

    it('should set local sharing type', () => {
        let documentDrive = utils.createDocument();
        documentDrive = reducer(
            documentDrive,
            actions.setSharingType({
                type: 'public',
            }),
        );

        expect(documentDrive.state.local.sharingType).toBe('public');
    });

    it('should set available offline', () => {
        let documentDrive = utils.createDocument();

        expect(documentDrive.state.local.availableOffline).toBe(false);
        documentDrive = reducer(
            documentDrive,
            actions.setAvailableOffline({
                availableOffline: true,
            }),
        );

        expect(documentDrive.state.local.availableOffline).toBe(true);
    });
});
