import { vi } from 'vitest';
import { reducer } from '../../document-models/budget-statement';
import {
    addVesting,
    deleteVesting,
    updateVesting,
} from '../../document-models/budget-statement/gen/creators';
import utils from '../../document-models/budget-statement/gen/utils';

const { createDocument } = utils;

describe('Budget Statement Vesting reducer', () => {
    it('should start as empty array', async () => {
        const document = createDocument();
        expect(document.state.global.vesting).toStrictEqual([]);
    });

    it('should add comment', async () => {
        const document = createDocument();
        const newDocument = reducer(
            document,
            addVesting({
                amount: '100',
                amountOld: '40',
                comment: 'New FTEs',
                currency: 'MKR',
                date: '2023-03-15',
                key: '123',
                vested: false,
            }),
        );
        expect(newDocument.state.global.vesting).toStrictEqual([
            {
                amount: '100',
                amountOld: '40',
                comment: 'New FTEs',
                currency: 'MKR',
                date: '2023-03-15',
                key: '123',
                vested: false,
            },
        ]);
        expect(document.state.global.vesting).toStrictEqual([]);
    });

    it('should update vesting', async () => {
        let document = createDocument();
        document = reducer(
            document,
            addVesting({
                amount: '100',
                amountOld: '40',
                comment: 'New FTEs',
                currency: 'MKR',
                date: '2023-03-15',
                key: '123',
                vested: false,
            }),
        );
        document = reducer(
            document,
            updateVesting({ key: '123', amount: '300' }),
        );
        expect(document.state.global.vesting[0]).toStrictEqual({
            amount: '300',
            amountOld: '40',
            comment: 'New FTEs',
            currency: 'MKR',
            date: '2023-03-15',
            key: '123',
            vested: false,
        });
    });

    it('should delete vesting', async () => {
        let document = createDocument();
        document = reducer(
            document,
            addVesting({
                key: '123',
            }),
        );

        document = reducer(document, deleteVesting({ vesting: '123' }));
        expect(document.state.global.vesting.length).toBe(0);
    });

    it('should generate vesting key if undefined', async () => {
        vi.useFakeTimers({ now: new Date('2023-03-16') });
        const document = createDocument();
        const newDocument = reducer(
            document,
            addVesting({
                date: '2023-03-16',
            }),
        );
        expect(newDocument.state.global.vesting[0].key.length).toBe(28);
        expect(newDocument.state.global.vesting[0].amount).toBe('');
    });

    it('should sort vestings by date', async () => {
        const document = createDocument();
        let newDocument = reducer(
            document,
            addVesting({
                date: '2023-03-11',
            }),
        );
        newDocument = reducer(
            newDocument,
            addVesting({
                date: '2023-03-15',
            }),
        );
        newDocument = reducer(
            newDocument,
            addVesting({
                date: '2023-03-13',
            }),
        );

        expect(newDocument.state.global.vesting[0].date).toBe('2023-03-11');
        expect(newDocument.state.global.vesting[1].date).toBe('2023-03-13');
        expect(newDocument.state.global.vesting[2].date).toBe('2023-03-15');
    });

    it('should throw if vesting key already exists', async () => {
        let document = createDocument();
        document = reducer(
            document,
            addVesting({
                key: '123',
                date: '2023-03-15',
            }),
        );
        expect(() =>
            reducer(
                document,
                addVesting({
                    key: '123',
                    date: '2023-03-13',
                }),
            ),
        ).toThrow();
    });

    it('should ignore non existing keys on update', async () => {
        let document = createDocument();
        document = reducer(
            document,
            addVesting({
                key: '123',
                amount: '100',
            }),
        );

        document = reducer(
            document,
            updateVesting({
                key: '123',
                amount: '200',
            }),
        );

        document = reducer(
            document,
            updateVesting({
                key: '456',
                amount: '300',
            }),
        );

        expect(document.state.global.vesting).toStrictEqual([
            {
                amount: '200',
                amountOld: '100',
                comment: '',
                currency: '',
                date: '',
                key: '123',
                vested: false,
            },
        ]);
    });
});
