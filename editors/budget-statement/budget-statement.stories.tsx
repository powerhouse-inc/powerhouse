import { reducer, utils } from '../../document-models/budget-statement';
import Editor from './editor';
import { createDocumentStory } from '../common/utils';

const initialAccount = utils.createAccount({
    address: 'eth:0xb5eB779cE300024EDB3dF9b6C007E312584f6F4f',
    name: 'Grants Program',
    lineItems: [
        {
            category: {
                ref: 'makerdao/budget-category',
                id: 'CommunityDevelopmentExpense',
                title: 'Community Development Expense',
            },
            headcountExpense: false,
            group: {
                ref: 'makerdao/project',
                id: 'core-unit/SES/2023/005',
                title: 'Core Unit Operational Support',
                color: '#000000',
            },
            budgetCap: 100000,
            payment: 0,
            actual: 25025,
            forecast: [
                {
                    month: '2023/02',
                    value: 30000,
                    budgetCap: 3000,
                },
                {
                    month: '2023/03',
                    value: 30000,
                    budgetCap: 3000,
                },
                {
                    month: '2023/04',
                    value: 20000,
                    budgetCap: 3000,
                },
            ],
            comment: '',
        },
    ],
});

const budgetStatement = utils.createExtendedState({
    state: { accounts: [initialAccount] },
});

const { meta, CreateDocumentStory } = createDocumentStory(
    Editor,
    reducer,
    budgetStatement,
);

export default { ...meta, title: 'Budget Statement' };

export { CreateDocumentStory };
