/**
 * This is a scaffold file meant for customization:
 * - change it by adding new tests or modifying the existing ones
 */

import { generateMock } from '@powerhousedao/codegen';

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

describe('Account Snapshot Document Model', () => {
    describe('Document Creation', () => {
        it('should create an Account Snapshot document', async () => {
            const document = utils.createDocument();

            expect(document).toBeDefined();
            expect(document.documentType).toBe('powerhouse/account-snapshot');
        });

        it('should create an empty document state', async () => {
            const document = utils.createDocument();
            expect(document.state).toStrictEqual({
                global: {
                    id: '',
                    ownerId: '',
                    ownerType: '',
                    period: '',
                    start: '',
                    end: '',
                    snapshotAccount: [],
                    actualsComparison: [],
                },
                local: {},
            });
        });
    });

    describe('Document Operations', () => {
        let document: AccountSnapshotDocument;

        beforeEach(() => {
            document = utils.createDocument();
        });

        it('should set document id', () => {
            const input = { id: '1' };
            const updatedDocument = reducer(document, creators.setId(input));

            expect(updatedDocument.state.global.id).toBe(input.id);
        });

        it('should set document owner id', () => {
            const input = { ownerId: '123' };
            const updatedDocument = reducer(
                document,
                creators.setOwnerId(input),
            );

            expect(updatedDocument.state.global.ownerId).toBe(input.ownerId);
        });

        it('should set document owner type', () => {
            const input = { ownerType: 'admin' };
            const updatedDocument = reducer(
                document,
                creators.setOwnerType(input),
            );

            expect(updatedDocument.state.global.ownerType).toBe(
                input.ownerType,
            );
        });

        it('should set document period', () => {
            const input = { period: '2020-01' };
            const updatedDocument = reducer(
                document,
                creators.setPeriod(input),
            );

            expect(updatedDocument.state.global.period).toBe(input.period);
        });

        it('should set document start', () => {
            const input = { start: '2020-01-01' };
            const updatedDocument = reducer(document, creators.setStart(input));

            expect(updatedDocument.state.global.start).toBe(input.start);
        });

        it('should set document end', () => {
            const input = { end: '2020-01-31' };
            const updatedDocument = reducer(document, creators.setEnd(input));

            expect(updatedDocument.state.global.end).toBe(input.end);
        });
    });
});
