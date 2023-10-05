import {
    setId,
    setEnd,
    setStart,
    setPeriod,
    setOwnerId,
    setOwnerType,
} from '../../document-models/account-snapshot/gen/creators';
import { reducer } from '../../document-models/account-snapshot';
import utils from '../../document-models/account-snapshot/gen/utils';
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
                id: '',
                ownerId: '',
                ownerType: '',
                period: '',
                start: '',
                end: '',
                snapshotAccount: [],
                actualsComparison: [],
            });
        });
    });

    describe('Document Operations', () => {
        let document: AccountSnapshotDocument;

        beforeEach(() => {
            document = utils.createDocument();
        });

        it('should set document id', () => {
            const input = { id: '123' };
            const updatedDocument = reducer(document, setId(input));

            expect(updatedDocument.state.id).toBe(input.id);
            expect(updatedDocument.operations).toHaveLength(1);
            expect(updatedDocument.operations[0].type).toBe('SET_ID');
            expect(updatedDocument.operations[0].input).toStrictEqual(input);
            expect(updatedDocument.operations[0].index).toEqual(0);
        });

        it('should set document owner id', () => {
            const input = { ownerId: '123' };
            const updatedDocument = reducer(document, setOwnerId(input));

            expect(updatedDocument.state.ownerId).toBe(input.ownerId);
            expect(updatedDocument.operations).toHaveLength(1);
            expect(updatedDocument.operations[0].type).toBe('SET_OWNER_ID');
            expect(updatedDocument.operations[0].input).toStrictEqual(input);
            expect(updatedDocument.operations[0].index).toEqual(0);
        });

        it('should set document owner type', () => {
            const input = { ownerType: 'admin' };
            const updatedDocument = reducer(document, setOwnerType(input));

            expect(updatedDocument.state.ownerType).toBe(input.ownerType);
            expect(updatedDocument.operations).toHaveLength(1);
            expect(updatedDocument.operations[0].type).toBe('SET_OWNER_TYPE');
            expect(updatedDocument.operations[0].input).toStrictEqual(input);
            expect(updatedDocument.operations[0].index).toEqual(0);
        });

        it('should set document period', () => {
            const input = { period: '2020-01' };
            const updatedDocument = reducer(document, setPeriod(input));

            expect(updatedDocument.state.period).toBe(input.period);
            expect(updatedDocument.operations).toHaveLength(1);
            expect(updatedDocument.operations[0].type).toBe('SET_PERIOD');
            expect(updatedDocument.operations[0].input).toStrictEqual(input);
            expect(updatedDocument.operations[0].index).toEqual(0);
        });

        it('should set document start', () => {
            const input = { start: '2020-01-01' };
            const updatedDocument = reducer(document, setStart(input));

            expect(updatedDocument.state.start).toBe(input.start);
            expect(updatedDocument.operations).toHaveLength(1);
            expect(updatedDocument.operations[0].type).toBe('SET_START');
            expect(updatedDocument.operations[0].input).toStrictEqual(input);
            expect(updatedDocument.operations[0].index).toEqual(0);
        });

        it('should set document end', () => {
            const input = { end: '2020-01-31' };
            const updatedDocument = reducer(document, setEnd(input));

            expect(updatedDocument.state.end).toBe(input.end);
            expect(updatedDocument.operations).toHaveLength(1);
            expect(updatedDocument.operations[0].type).toBe('SET_END');
            expect(updatedDocument.operations[0].input).toStrictEqual(input);
            expect(updatedDocument.operations[0].index).toEqual(0);
        });
    });
});
