/**
 * This is a scaffold file meant for customization:
 * - change it by adding new tests or modifying the existing ones
 */

import {
    DocumentDriveLocalState,
    DocumentDriveState,
} from '../../document-models/document-drive';
import utils from '../../document-models/document-drive/gen/utils';

const initialGlobalState: DocumentDriveState = {
    id: '',
    name: '',
    nodes: [],
    icon: null,
    remoteUrl: null,
};

const initialLocalState: DocumentDriveLocalState = {
    sharingType: 'private',
    availableOffline: false,
};

describe('Document Drive Document Model', () => {
    it('should create a new Document Drive document', () => {
        const document = utils.createDocument();

        expect(document).toBeDefined();
        expect(document.documentType).toBe('powerhouse/document-drive');
    });

    it('should create a new Document Drive document with a valid initial state', () => {
        const document = utils.createDocument();
        expect(document.state.global).toStrictEqual(initialGlobalState);
        expect(document.state.local).toStrictEqual(initialLocalState);
    });
});
