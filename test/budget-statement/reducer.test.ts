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
        const document = createBudgetStatement();
        expect(document.extendedState.revision).toBe(0);
        expect(document.extendedState.documentType).toBe(
            'powerhouse/budget-statement'
        );
        expect(document.extendedState.state).toBeDefined();
    });

    it('should update name', async () => {
        const document = createBudgetStatement();
        const newDocument = reducer(document, setName('SES Jan 2023'));
        expect(newDocument.extendedState.name).toBe('SES Jan 2023');
    });

    it('should update revision', async () => {
        const document = createBudgetStatement();
        const newDocument = reducer(document, setName('SES Jan 2023'));
        expect(newDocument.extendedState.revision).toBe(1);
    });

    it('should init budget statement with correct type', async () => {
        const document = createBudgetStatement();
        expect(document.extendedState.documentType).toBe(
            'powerhouse/budget-statement'
        );
    });

    it('should init budget statement with provided data', async () => {
        const document = createBudgetStatement({
            name: 'March',
            state: {
                owner: {
                    ref: 'makerdao/core-unit',
                    id: 'SES-001',
                    title: 'Sustainable Ecosystem Scaling',
                },
            },
        });
        expect(document.extendedState.state.owner).toStrictEqual({
            ref: 'makerdao/core-unit',
            id: 'SES-001',
            title: 'Sustainable Ecosystem Scaling',
        });
        expect(document.extendedState.name).toBe('March');
    });

    it('should throw error on invalid action', async () => {
        const document = createBudgetStatement();
        expect(() =>
            reducer(document, addAccount([0] as unknown as AccountInput[]))
        ).toThrow();
    });

    it('should set owner', async () => {
        const document = createBudgetStatement();
        const newDocument = reducer(
            document,
            setOwner({
                ref: 'makerdao/core-unit',
                id: 'SES-001',
                title: 'Sustainable Ecosystem Scaling',
            })
        );
        expect(newDocument.extendedState.state.owner).toStrictEqual({
            ref: 'makerdao/core-unit',
            id: 'SES-001',
            title: 'Sustainable Ecosystem Scaling',
        });
        expect(document.extendedState.state.owner).toStrictEqual({
            ref: null,
            id: null,
            title: null,
        });
    });

    it('should set month', async () => {
        const document = createBudgetStatement();
        const newDocument = reducer(document, setMonth('Feb'));
        expect(newDocument.extendedState.state.month).toBe('Feb');
        expect(document.extendedState.state.month).toBe(null);
    });

    it('should set quoteCurrency', async () => {
        const document = createBudgetStatement();
        const newDocument = reducer(document, setQuoteCurrency('DAI'));
        expect(newDocument.extendedState.state.quoteCurrency).toBe('DAI');
        expect(document.extendedState.state.quoteCurrency).toBe(null);
    });
});
