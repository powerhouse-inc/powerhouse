import { setName } from '../../src';
import {
    approve,
    createBudgetStatement,
    escalate,
    reducer,
    reopen,
    submitForReview,
} from '../../src/budget-statement';

describe('Budget Statement status reducer', () => {
    it('should set status to Review', async () => {
        const state = createBudgetStatement();
        const newState = reducer(state, submitForReview());
        expect(newState.data.status).toBe('Review');
        expect(state.data.status).toBe('Draft');
    });

    it('should set status to Escalated', async () => {
        const state = createBudgetStatement();
        const newState = reducer(state, escalate());
        expect(newState.data.status).toBe('Escalated');
        expect(state.data.status).toBe('Draft');
    });

    it('should set status to Final', async () => {
        const state = createBudgetStatement();
        const newState = reducer(state, approve());
        expect(newState.data.status).toBe('Final');
        expect(state.data.status).toBe('Draft');
    });

    it('should reset status to Review', async () => {
        let state = createBudgetStatement();
        state = reducer(state, escalate());
        const newState = reducer(state, reopen());
        expect(newState.data.status).toBe('Review');
        expect(state.data.status).toBe('Escalated');
    });
});
