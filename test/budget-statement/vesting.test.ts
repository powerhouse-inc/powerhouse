import { reducer } from '../../src/budget-statement';
import { createBudgetStatement } from '../../src/budget-statement/custom/utils';
import {
    addVesting,
    deleteVesting,
    updateVesting,
} from '../../src/budget-statement/gen';

describe('Budget Statement Vesting reducer', () => {
    it('should start as empty array', async () => {
        const state = createBudgetStatement();
        expect(state.state.vesting).toStrictEqual([]);
    });

    it('should add comment', async () => {
        const state = createBudgetStatement();
        const newState = reducer(
            state,
            addVesting([
                {
                    amount: '100',
                    amountOld: '40',
                    comment: 'New FTEs',
                    currency: 'MKR',
                    date: '2023-03-15',
                    key: '123',
                    vested: false,
                },
            ])
        );
        expect(newState.state.vesting).toStrictEqual([
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
        expect(state.state.vesting).toStrictEqual([]);
    });

    it('should update vesting', async () => {
        let state = createBudgetStatement();
        state = reducer(
            state,
            addVesting([
                {
                    amount: '100',
                    amountOld: '40',
                    comment: 'New FTEs',
                    currency: 'MKR',
                    date: '2023-03-15',
                    key: '123',
                    vested: false,
                },
            ])
        );
        state = reducer(state, updateVesting([{ key: '123', amount: '300' }]));
        expect(state.state.vesting[0]).toStrictEqual({
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
        let state = createBudgetStatement();
        state = reducer(
            state,
            addVesting([
                {
                    key: '123',
                },
            ])
        );

        state = reducer(state, deleteVesting(['123']));
        expect(state.state.vesting.length).toBe(0);
    });

    it('should generate vesting key if undefined', async () => {
        jest.useFakeTimers({ now: new Date('2023-03-16') });
        const state = createBudgetStatement();
        const newState = reducer(
            state,
            addVesting([
                {
                    date: '2023-03-16',
                },
            ])
        );
        expect(newState.state.vesting[0].key.length).toBe(28);
        expect(newState.state.vesting[0].amount).toBe('');
    });

    it('should sort vestings by date', async () => {
        const state = createBudgetStatement();
        const newState = reducer(
            state,
            addVesting([
                {
                    date: '2023-03-11',
                },
                {
                    date: '2023-03-15',
                },
                {
                    date: '2023-03-13',
                },
            ])
        );
        expect(newState.state.vesting[0].date).toBe('2023-03-11');
        expect(newState.state.vesting[1].date).toBe('2023-03-13');
        expect(newState.state.vesting[2].date).toBe('2023-03-15');
    });

    it('should throw if vesting key already exists', async () => {
        const state = createBudgetStatement();
        expect(() =>
            reducer(
                state,
                addVesting([
                    {
                        key: '123',
                        date: '2023-03-15',
                    },
                    {
                        key: '123',
                        date: '2023-03-13',
                    },
                ])
            )
        ).toThrow();
    });

    it('should ignore non existing keys on update', async () => {
        let state = createBudgetStatement();
        state = reducer(
            state,
            addVesting([
                {
                    key: '123',
                    amount: '100',
                },
            ])
        );

        state = reducer(
            state,
            updateVesting([
                {
                    key: '123',
                    amount: '200',
                },
                {
                    key: '456',
                    amount: '300',
                },
            ])
        );

        expect(state.state.vesting).toStrictEqual([
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
