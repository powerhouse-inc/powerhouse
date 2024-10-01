import { AddAccountInput, reducer } from '../..';
import {
    addAccount,
    setMonth,
    setOwner,
    setQuoteCurrency,
} from '../../gen/creators';
import utils from '../../gen/utils';
import { actions } from 'document-model/document';

const { createDocument } = utils;

describe('Budget Statement reducer', () => {
    it('should create initial state', async () => {
        const document = createDocument();
        expect(document.revision.global).toBe(0);
        expect(document.documentType).toBe('powerhouse/budget-statement');
        expect(document.state).toBeDefined();
    });

    it('should update name', async () => {
        const document = createDocument();
        const newDocument = reducer(document, actions.setName('SES Jan 2023'));
        expect(newDocument.name).toBe('SES Jan 2023');
    });

    it('should update revision', async () => {
        const document = createDocument();
        const newDocument = reducer(document, actions.setName('SES Jan 2023'));
        expect(newDocument.revision.global).toBe(1);
        expect(newDocument.revision.local).toBe(0);
    });

    it('should init budget statement with correct type', async () => {
        const document = createDocument();
        expect(document.documentType).toBe('powerhouse/budget-statement');
    });

    it('should init budget statement with provided data', async () => {
        const document = createDocument({
            name: 'March',
            state: {
                global: {
                    owner: {
                        ref: 'makerdao/core-unit',
                        id: 'SES-001',
                        title: 'Sustainable Ecosystem Scaling',
                    },
                },
                local: {},
            },
        });
        expect(document.state.global.owner).toStrictEqual({
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
        expect(newDocument.state.global.owner).toStrictEqual({
            ref: 'makerdao/core-unit',
            id: 'SES-001',
            title: 'Sustainable Ecosystem Scaling',
        });
        expect(document.state.global.owner).toStrictEqual({
            ref: null,
            id: null,
            title: null,
        });
    });

    it('should set month', async () => {
        const document = createDocument();
        const newDocument = reducer(document, setMonth({ month: 'Feb' }));
        expect(newDocument.state.global.month).toBe('Feb');
        expect(document.state.global.month).toBe(null);
    });

    it('should set quoteCurrency', async () => {
        const document = createDocument();
        const newDocument = reducer(
            document,
            setQuoteCurrency({ quoteCurrency: 'DAI' }),
        );
        expect(newDocument.state.global.quoteCurrency).toBe('DAI');
        expect(document.state.global.quoteCurrency).toBe(null);
    });
});
