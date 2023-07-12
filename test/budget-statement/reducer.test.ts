import { AccountInput, reducer } from '../../src/budget-statement';
import { createBudgetStatement } from '../../src/budget-statement/custom/utils';
import {
    addAccount,
    setMonth,
    setOwner,
    setQuoteCurrency,
} from '../../src/budget-statement/gen';
import { setName } from '../../src/document/actions';

describe('Budget Statement reducer', () => {
    it('should create initial state', async () => {
        const state = createBudgetStatement();
        expect(state.revision).toBe(0);
        expect(state.documentType).toBe('powerhouse/budget-statement');
        expect(state.state).toBeDefined();
    });

    it('should update name', async () => {
        const state = createBudgetStatement();
        const newState = reducer(state, setName('SES Jan 2023'));
        expect(newState.name).toBe('SES Jan 2023');
    });

    it('should update revision', async () => {
        const state = createBudgetStatement();
        const newState = reducer(state, setName('SES Jan 2023'));
        expect(newState.revision).toBe(1);
    });

    it('should init budget statement with correct type', async () => {
        const state = createBudgetStatement();
        expect(state.documentType).toBe('powerhouse/budget-statement');
    });

    it('should init budget statement with provided data', async () => {
        const state = createBudgetStatement({
            name: 'March',
            state: {
                owner: {
                    ref: 'makerdao/core-unit',
                    id: 'SES-001',
                    title: 'Sustainable Ecosystem Scaling',
                },
            },
        });
        expect(state.state.owner).toStrictEqual({
            ref: 'makerdao/core-unit',
            id: 'SES-001',
            title: 'Sustainable Ecosystem Scaling',
        });
        expect(state.name).toBe('March');
    });

    it('should throw error on invalid action', async () => {
        const state = createBudgetStatement();
        expect(() =>
            reducer(state, addAccount([0] as unknown as AccountInput[]))
        ).toThrow();
    });

    it('should set owner', async () => {
        const state = createBudgetStatement();
        const newState = reducer(
            state,
            setOwner({
                ref: 'makerdao/core-unit',
                id: 'SES-001',
                title: 'Sustainable Ecosystem Scaling',
            })
        );
        expect(newState.state.owner).toStrictEqual({
            ref: 'makerdao/core-unit',
            id: 'SES-001',
            title: 'Sustainable Ecosystem Scaling',
        });
        expect(state.state.owner).toStrictEqual({
            ref: null,
            id: null,
            title: null,
        });
    });

    it('should set month', async () => {
        const state = createBudgetStatement();
        const newState = reducer(state, setMonth('Feb'));
        expect(newState.state.month).toBe('Feb');
        expect(state.state.month).toBe(null);
    });

    it('should set quoteCurrency', async () => {
        const state = createBudgetStatement();
        const newState = reducer(state, setQuoteCurrency('DAI'));
        expect(newState.state.quoteCurrency).toBe('DAI');
        expect(state.state.quoteCurrency).toBe(null);
    });
});
