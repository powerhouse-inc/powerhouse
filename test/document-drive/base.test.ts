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
            actions.addDrive({
                id: 'drive',
                hash: '',
                name: 'drive',
                nodes: [],
            }),
        );
        documentDrive = reducer(
            documentDrive,
            actions.addFolder({
                drive: 'drive',
                hash: '',
                name: '1',
                path: '1',
            }),
        );
        documentDrive = reducer(
            documentDrive,
            actions.addFolder({
                drive: 'drive',
                hash: '',
                name: '1.1',
                path: '1/1.1',
            }),
        );

        expect(documentDrive.state.drives[0].nodes.length).toBe(2);

        documentDrive = reducer(
            documentDrive,
            actions.deleteNode({
                drive: 'drive',
                path: '1',
            }),
        );

        expect(documentDrive.state.drives[0].nodes.length).toBe(0);
    });
});
