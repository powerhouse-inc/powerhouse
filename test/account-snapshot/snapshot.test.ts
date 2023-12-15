import {
    setId,
    setEnd,
    setStart,
    setPeriod,
    setOwnerId,
    setOwnerType,
} from '../../document-models/account-snapshot/gen/creators';
import utils from '../../document-models/account-snapshot/gen/utils';
import { reducer } from '../../document-models/account-snapshot/gen/reducer';
import { AccountSnapshotDocument } from '../../document-models/account-snapshot/gen/types';

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
            const updatedDocument = reducer(document, setId(input));

            expect(updatedDocument.state.global.id).toBe(input.id);
        });

        it('should set document owner id', () => {
            const input = { ownerId: '123' };
            const updatedDocument = reducer(document, setOwnerId(input));

            expect(updatedDocument.state.global.ownerId).toBe(input.ownerId);
        });

        it('should set document owner type', () => {
            const input = { ownerType: 'admin' };
            const updatedDocument = reducer(document, setOwnerType(input));

            expect(updatedDocument.state.global.ownerType).toBe(
                input.ownerType,
            );
        });

        it('should set document period', () => {
            const input = { period: '2020-01' };
            const updatedDocument = reducer(document, setPeriod(input));

            expect(updatedDocument.state.global.period).toBe(input.period);
        });

        it('should set document start', () => {
            const input = { start: '2020-01-01' };
            const updatedDocument = reducer(document, setStart(input));

            expect(updatedDocument.state.global.start).toBe(input.start);
        });

        it('should set document end', () => {
            const input = { end: '2020-01-31' };
            const updatedDocument = reducer(document, setEnd(input));

            expect(updatedDocument.state.global.end).toBe(input.end);
        });
    });
});
