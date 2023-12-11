/**
 * This is a scaffold file meant for customization:
 * - change it by adding new tests or modifying the existing ones
 */

import { generateMock } from '@acaldas/powerhouse';

import utils from '../../document-models/document-drive/gen/utils';
import { z } from '../../document-models/document-drive/gen/schema';
import { reducer } from '../../document-models/document-drive/gen/reducer';
import * as creators from '../../document-models/document-drive/gen/node/creators';
import { DocumentDriveDocument } from '../../document-models/document-drive/gen/types';

describe('Node Operations', () => {
    let document: DocumentDriveDocument;

    beforeEach(() => {
        document = utils.createDocument();
    });

    it('should handle addFile operation', () => {
        const input = generateMock(z.AddFileInputSchema());
        const updatedDocument = reducer(document, creators.addFile(input));

        expect(updatedDocument.operations.global).toHaveLength(1);
        expect(updatedDocument.operations.global[0].type).toBe('ADD_FILE');
        expect(updatedDocument.operations.global[0].input).toStrictEqual(input);
        expect(updatedDocument.operations.global[0].index).toEqual(0);
    });

    it('should handle addFolder operation', () => {
        const input = generateMock(z.AddFolderInputSchema());
        const updatedDocument = reducer(document, creators.addFolder(input));

        expect(updatedDocument.operations.global).toHaveLength(1);
        expect(updatedDocument.operations.global[0].type).toBe('ADD_FOLDER');
        expect(updatedDocument.operations.global[0].input).toStrictEqual(input);
        expect(updatedDocument.operations.global[0].index).toEqual(0);
    });

    it('should handle deleteNode operation', () => {
        const folder = generateMock(z.AddFolderInputSchema());
        document = reducer(document, creators.addFolder(folder));

        const input = generateMock(z.DeleteNodeInputSchema(), {
            stringMap: { id: () => folder.id },
        });
        const updatedDocument = reducer(document, creators.deleteNode(input));

        expect(updatedDocument.operations.global).toHaveLength(2);
        expect(updatedDocument.operations.global[1].type).toBe('DELETE_NODE');
        expect(updatedDocument.operations.global[1].input).toStrictEqual(input);
        expect(updatedDocument.operations.global[1].index).toEqual(1);
    });

    it('should handle updateFile operation', () => {
        const folder = generateMock(z.AddFolderInputSchema());
        document = reducer(document, creators.addFolder(folder));
        const input = generateMock(z.UpdateFileInputSchema(), {
            stringMap: { id: () => folder.id },
        });
        const updatedDocument = reducer(document, creators.updateFile(input));

        expect(updatedDocument.operations.global).toHaveLength(2);
        expect(updatedDocument.operations.global[1].type).toBe('UPDATE_FILE');
        expect(updatedDocument.operations.global[1].input).toStrictEqual(input);
        expect(updatedDocument.operations.global[1].index).toEqual(1);
    });

    it('should handle updateNode operation', () => {
        const input = generateMock(z.UpdateNodeInputSchema());
        const updatedDocument = reducer(document, creators.updateNode(input));

        expect(updatedDocument.operations.global).toHaveLength(1);
        expect(updatedDocument.operations.global[0].type).toBe('UPDATE_NODE');
        expect(updatedDocument.operations.global[0].input).toStrictEqual(input);
        expect(updatedDocument.operations.global[0].index).toEqual(0);
    });

    it('should handle copyNode operation', () => {
        const folder = generateMock(z.AddFolderInputSchema());
        document = reducer(document, creators.addFolder(folder));
        const input = generateMock(z.CopyNodeInputSchema(), {
            stringMap: { srcId: () => folder.id },
        });
        const updatedDocument = reducer(document, creators.copyNode(input));

        expect(updatedDocument.operations.global).toHaveLength(2);
        expect(updatedDocument.operations.global[1].type).toBe('COPY_NODE');
        expect(updatedDocument.operations.global[1].input).toStrictEqual(input);
        expect(updatedDocument.operations.global[1].index).toEqual(1);
    });

    it('should handle moveNode operation', () => {
        const folder = generateMock(z.AddFolderInputSchema());
        document = reducer(document, creators.addFolder(folder));
        const input = generateMock(z.MoveNodeInputSchema(), {
            stringMap: { srcFolder: () => folder.id },
        });
        const updatedDocument = reducer(document, creators.moveNode(input));

        expect(updatedDocument.operations.global).toHaveLength(2);
        expect(updatedDocument.operations.global[1].type).toBe('MOVE_NODE');
        expect(updatedDocument.operations.global[1].input).toStrictEqual(input);
        expect(updatedDocument.operations.global[1].index).toEqual(1);
    });
});
