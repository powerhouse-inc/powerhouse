import { Document } from 'document-model';
import {
    reducer,
    actions,
    utils,
    DocumentDriveState,
    DocumentDriveAction,
} from '../../document-models/document-drive';

describe('DocumentDrive Class', () => {
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
});
