/**
 * This is a scaffold file meant for customization:
 * - change it by adding new tests or modifying the existing ones
 */

import { generateMock } from '@acaldas/powerhouse';

import utils from '../../gen/utils';
import { z } from '../../gen/schema';
import { reducer } from '../../gen/reducer';
import * as creators from '../../gen/snapshot/creators';
import { AccountSnapshotDocument } from '../../gen/types';

describe('Snapshot Operations', () => {
    let document: AccountSnapshotDocument;

    beforeEach(() => {
        document = utils.createDocument();
    });

    it('should handle setId operation', () => {
        const input = generateMock(z.SetIdInputSchema());
        const updatedDocument = reducer(document, creators.setId(input));

        expect(updatedDocument.operations.global).toHaveLength(1);
        expect(updatedDocument.operations.global[0].type).toBe('SET_ID');
        // expect(updatedDocument.operations.global[0].input).toStrictEqual(input);
        expect(updatedDocument.operations.global[0].index).toEqual(0);
    });

    it('should handle setOwnerId operation', () => {
        const input = generateMock(z.SetOwnerIdInputSchema());
        const updatedDocument = reducer(document, creators.setOwnerId(input));

        expect(updatedDocument.operations.global).toHaveLength(1);
        expect(updatedDocument.operations.global[0].type).toBe('SET_OWNER_ID');
        expect(updatedDocument.operations.global[0].input).toStrictEqual(input);
        expect(updatedDocument.operations.global[0].index).toEqual(0);
    });

    it('should handle setOwnerType operation', () => {
        const input = generateMock(z.SetOwnerTypeInputSchema());
        const updatedDocument = reducer(document, creators.setOwnerType(input));

        expect(updatedDocument.operations.global).toHaveLength(1);
        expect(updatedDocument.operations.global[0].type).toBe(
            'SET_OWNER_TYPE',
        );
        expect(updatedDocument.operations.global[0].input).toStrictEqual(input);
        expect(updatedDocument.operations.global[0].index).toEqual(0);
    });

    it('should handle setPeriod operation', () => {
        const input = generateMock(z.SetPeriodInputSchema());
        const updatedDocument = reducer(document, creators.setPeriod(input));

        expect(updatedDocument.operations.global).toHaveLength(1);
        expect(updatedDocument.operations.global[0].type).toBe('SET_PERIOD');
        expect(updatedDocument.operations.global[0].input).toStrictEqual(input);
        expect(updatedDocument.operations.global[0].index).toEqual(0);
    });

    it('should handle setStart operation', () => {
        const input = generateMock(z.SetStartInputSchema());
        const updatedDocument = reducer(document, creators.setStart(input));

        expect(updatedDocument.operations.global).toHaveLength(1);
        expect(updatedDocument.operations.global[0].type).toBe('SET_START');
        expect(updatedDocument.operations.global[0].input).toStrictEqual(input);
        expect(updatedDocument.operations.global[0].index).toEqual(0);
    });

    it('should handle setEnd operation', () => {
        const input = generateMock(z.SetEndInputSchema());
        const updatedDocument = reducer(document, creators.setEnd(input));

        expect(updatedDocument.operations.global).toHaveLength(1);
        expect(updatedDocument.operations.global[0].type).toBe('SET_END');
        expect(updatedDocument.operations.global[0].input).toStrictEqual(input);
        expect(updatedDocument.operations.global[0].index).toEqual(0);
    });
});
