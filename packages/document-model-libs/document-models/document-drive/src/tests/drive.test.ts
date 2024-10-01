/**
 * This is a scaffold file meant for customization:
 * - change it by adding new tests or modifying the existing ones
 */

import { generateMock } from '@powerhousedao/codegen';

import utils from '../../gen/utils';
import { z } from '../../gen/schema';
import { reducer } from '../../gen/reducer';
import * as creators from '../../gen/drive/creators';
import { DocumentDriveDocument } from '../../gen/types';

describe('Drive Operations', () => {
    let document: DocumentDriveDocument;

    beforeEach(() => {
        document = utils.createDocument();
    });

    it('should handle setDriveName operation', () => {
        const input = generateMock(z.SetDriveNameInputSchema());
        const updatedDocument = reducer(document, creators.setDriveName(input));

        expect(updatedDocument.operations.global).toHaveLength(1);
        expect(updatedDocument.operations.global[0].type).toBe(
            'SET_DRIVE_NAME',
        );
        expect(updatedDocument.operations.global[0].input).toStrictEqual(input);
        expect(updatedDocument.operations.global[0].index).toEqual(0);
    });

    it('should handle setSharingType operation', () => {
        const input = generateMock(z.SetSharingTypeInputSchema());
        const updatedDocument = reducer(
            document,
            creators.setSharingType(input),
        );

        expect(updatedDocument.operations.local).toHaveLength(1);
        expect(updatedDocument.operations.local[0].type).toBe(
            'SET_SHARING_TYPE',
        );
        expect(updatedDocument.operations.local[0].input).toStrictEqual(input);
        expect(updatedDocument.operations.local[0].index).toEqual(0);
    });

    it('should handle setAvailableOffline operation', () => {
        const input = generateMock(z.SetAvailableOfflineInputSchema());
        const updatedDocument = reducer(
            document,
            creators.setAvailableOffline(input),
        );

        expect(updatedDocument.operations.local).toHaveLength(1);
        expect(updatedDocument.operations.local[0].type).toBe(
            'SET_AVAILABLE_OFFLINE',
        );
        expect(updatedDocument.operations.local[0].input).toStrictEqual(input);
        expect(updatedDocument.operations.local[0].index).toEqual(0);
    });
});
