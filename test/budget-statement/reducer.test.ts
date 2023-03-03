import { setName } from '../../src';
import { createBudgetStatement, reducer } from '../../src/budget-statement';

describe('Budget Statement reducer', () => {
    it('should create initial state', async () => {
        const state = createBudgetStatement();
        expect(state.revision).toBe(0);
        expect(state.data).toBeDefined();
    });

    it('should start as Draft', async () => {
        const state = createBudgetStatement();
        expect(state.data.status).toBe('Draft');
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
});
