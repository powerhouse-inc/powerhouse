import * as documentModels from 'document-model-libs/document-models';
import { DocumentModel } from 'document-model/document';
import { describe, it, vi } from 'vitest';
import { IDriveStorage } from '../src';
import { ReadModeStorage } from '../src/storage/read-mode';

function getDocumentModel(documentType: string): DocumentModel {
    const documentModel = Object.values(documentModels).find(
        model => model.documentModel.id === documentType
    );
    if (!documentModel) {
        throw new Error(`Document type ${documentType} not supported`);
    }
    return documentModel as DocumentModel;
}

describe('Graphql methods', () => {
    // Mocks
    const mockBaseStorage = {
        getDrive: vi.fn()
        // Add other methods from IDriveStorage that you might use
    };

    it('should fall back to baseStorage if drive ID is not found in read drives', async ({
        expect
    }) => {
        // Arrange
        const readModeStorage = new ReadModeStorage(
            mockBaseStorage as unknown as IDriveStorage,
            getDocumentModel
        );

        // The ID that is not part of read drives
        const nonReadDriveId = 'non-read-drive';
        const mockDrive = { some: 'drive data' };
        mockBaseStorage.getDrive.mockResolvedValue(mockDrive);

        const result = await readModeStorage.getDrive(nonReadDriveId);

        expect(mockBaseStorage.getDrive).toHaveBeenCalledWith(nonReadDriveId);
        expect(result).toEqual(mockDrive);
    });

    it('should throw DriveNotFoundError if drive ID is not found and method not in baseStorage', async ({
        expect
    }) => {
        const readModeStorage = new ReadModeStorage(
            mockBaseStorage as unknown as IDriveStorage,
            getDocumentModel
        );

        mockBaseStorage.getDrive.mockRejectedValue(
            new Error('Drive not found')
        );
        const nonExistentDriveId = 'non-existent-drive';
        await expect(
            readModeStorage.getDrive(nonExistentDriveId)
        ).rejects.toThrow('Drive not found');
    });

    it('should return read drive when drive ID is found in read drives', async ({
        expect
    }) => {
        // Arrange
        const readModeStorage = new ReadModeStorage(
            mockBaseStorage as unknown as IDriveStorage,
            getDocumentModel
        );

        const readDriveId = 'read-drive';
        const readDrive = {
            drive: { some: 'drive data' },
            context: { some: 'context' }
        };

        await readModeStorage.addReadDrive(
            readDriveId,
            readDrive.drive,
            readDrive.context
        );

        const result = await readModeStorage.getDrive(readDriveId);

        expect(result).toEqual(readDrive.drive);
    });
});
