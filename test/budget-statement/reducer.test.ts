import {
    AddAccountInput,
    reducer,
} from '../../document-models/budget-statement';
import {
    addAccount,
    setMonth,
    setOwner,
    setQuoteCurrency,
} from '../../document-models/budget-statement/gen/creators';
import utils from '../../document-models/budget-statement/gen/utils';
import { setName } from '../../src/document/actions';

const { createDocument } = utils;

describe('Budget Statement reducer', () => {
    it('should create initial state', async () => {
        const document = createDocument();
        expect(document.revision).toBe(0);
        expect(document.documentType).toBe('powerhouse/budget-statement');
        expect(document.state).toBeDefined();
    });

    it('should update name', async () => {
        const document = createDocument();
        const newDocument = reducer(document, setName('SES Jan 2023'));
        expect(newDocument.name).toBe('SES Jan 2023');
    });

    it('should update revision', async () => {
        const document = createDocument();
        const newDocument = reducer(document, setName('SES Jan 2023'));
        expect(newDocument.revision).toBe(1);
    });

    it('should init budget statement with correct type', async () => {
        const document = createDocument();
        expect(document.documentType).toBe('powerhouse/budget-statement');
    });

    it('should init budget statement with provided data', async () => {
        const document = createDocument({
            name: 'March',
            state: {
                owner: {
                    ref: 'makerdao/core-unit',
                    id: 'SES-001',
                    title: 'Sustainable Ecosystem Scaling',
                },
            },
        });
        expect(document.state.owner).toStrictEqual({
            ref: 'makerdao/core-unit',
            id: 'SES-001',
            title: 'Sustainable Ecosystem Scaling',
        });
        expect(document.name).toBe('March');
    });

    it('should throw error on invalid action', async () => {
        const document = createDocument();
        expect(() =>
            reducer(document, addAccount({} as unknown as AddAccountInput)),
        ).toThrow();
    });

    it('should set owner', async () => {
        const document = createDocument();
        const newDocument = reducer(
            document,
            setOwner({
                ref: 'makerdao/core-unit',
                id: 'SES-001',
                title: 'Sustainable Ecosystem Scaling',
            }),
        );
        expect(newDocument.state.owner).toStrictEqual({
            ref: 'makerdao/core-unit',
            id: 'SES-001',
            title: 'Sustainable Ecosystem Scaling',
        });
        expect(document.state.owner).toStrictEqual({
            ref: null,
            id: null,
            title: null,
        });
    });

    it('should set month', async () => {
        const document = createDocument();
        const newDocument = reducer(document, setMonth({ month: 'Feb' }));
        expect(newDocument.state.month).toBe('Feb');
        expect(document.state.month).toBe(null);
    });

    it('should set quoteCurrency', async () => {
        const document = createDocument();
        const newDocument = reducer(
            document,
            setQuoteCurrency({ quoteCurrency: 'DAI' }),
        );
        expect(newDocument.state.quoteCurrency).toBe('DAI');
        expect(document.state.quoteCurrency).toBe(null);
    });
});
