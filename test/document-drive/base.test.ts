import { Document } from 'document-model';
import {
    reducer,
    actions,
    utils,
    DocumentDriveState,
    DocumentDriveAction,
    DocumentDrive,
} from '../../document-models/document-drive';
import { Signal } from 'document-model/document';

describe('DocumentDrive Class', () => {
    it('should rename drive', () => {
        let documentDrive: Document.Document<
            DocumentDriveState,
            DocumentDriveAction
        > = utils.createDocument();

        expect(documentDrive.state.name).toBe('');

        documentDrive = reducer(
            documentDrive,
            actions.setDriveName({
                name: 'new name',
            }),
        );

        expect(documentDrive.state.name).toBe('new name');
    });

    it('should delete children when node is deleted', () => {
        let documentDrive: Document.Document<
            DocumentDriveState,
            DocumentDriveAction
        > = utils.createDocument();
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

        expect(documentDrive.state.nodes.length).toBe(0);
    });

    it('should trigger create child document signal', () => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        function dispatch(_signal: Signal) {}
        const documentDrive = new DocumentDrive(undefined, dispatch);
        // @ts-expect-error spying on private method
        const spy = vi.spyOn(documentDrive, '_dispatch');
        documentDrive.addFile({
            id: '1',
            documentType: 'test',
            name: 'document',
        });

        expect(spy).toHaveBeenCalledOnce();
        expect(spy.mock.lastCall!.shift()).toStrictEqual({
            type: 'CREATE_CHILD_DOCUMENT',
            input: { id: '1', documentType: 'test' },
        });
    });
});
