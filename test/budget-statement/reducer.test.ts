import { setName } from '../../src';
import {
    createBudgetStatement,
    init,
    reducer,
} from '../../src/budget-statement';

describe('Budget Statement reducer', () => {
    it('should create initial state', async () => {
        const state = createBudgetStatement();
        expect(state.revision).toBe(0);
        expect(state.documentType).toBe('powerhouse/budget-statement');
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

    it('should init budget statement with provided data', async () => {
        const state = createBudgetStatement();
        const newState = reducer(
            state,
            init({
                name: 'March',
                data: {
                    owner: {
                        ref: 'makerdao/core-unit',
                        id: 'SES-001',
                        title: 'Sustainable Ecosystem Scaling',
                    },
                },
            })
        );
        expect(newState.data.owner).toStrictEqual({
            ref: 'makerdao/core-unit',
            id: 'SES-001',
            title: 'Sustainable Ecosystem Scaling',
        });
        expect(state.data.owner).toStrictEqual({
            id: null,
            ref: null,
            title: null,
        });
        expect(newState.name).toBe('March');
        expect(state.name).toBe('');
    });
});
