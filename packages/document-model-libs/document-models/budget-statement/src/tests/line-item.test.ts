/**
 * This is a scaffold file meant for customization:
 * - change it by adding new tests or modifying the existing ones
 */

import { generateMock } from '@powerhousedao/codegen';

import { createLineItem, utils } from '../..';
import * as creators from '../../gen/creators';
import { reducer } from '../../gen/reducer';
import { z } from '../../gen/schema';

const { createDocument } = utils;
const { addLineItem, addAccount } = creators;

describe('LineItem Operations', () => {
    it('should add line item', () => {
        let document = createDocument();
        document = reducer(
            document,
            addAccount({
                address: 'eth:0xb5eB779cE300024EDB3dF9b6C007E312584f6F4f',
                name: 'Grants Program',
            }),
        );
        const newDocument = reducer(
            document,
            addLineItem({
                accountId: 'eth:0xb5eB779cE300024EDB3dF9b6C007E312584f6F4f',
                category: {
                    ref: 'makerdao/budget-category',
                    id: 'TravelAndEntertainment',
                    title: 'Travel & Entertainment',
                },
                group: {
                    ref: 'makerdao/project',
                    id: 'core-unit/SES/2023/005',
                    title: 'Core Unit Operational Support',
                    color: 'teal',
                },
                headcountExpense: true,
            }),
        );
        expect(newDocument.state.global.accounts[0].lineItems).toStrictEqual([
            {
                category: {
                    ref: 'makerdao/budget-category',
                    id: 'TravelAndEntertainment',
                    title: 'Travel & Entertainment',
                },
                group: {
                    ref: 'makerdao/project',
                    id: 'core-unit/SES/2023/005',
                    title: 'Core Unit Operational Support',
                    color: 'teal',
                },
                budgetCap: null,
                payment: null,
                actual: null,
                comment: null,
                headcountExpense: true,
                forecast: [],
            },
        ]);
        expect(document.state.global.accounts[0].lineItems).toStrictEqual([]);
    });

    it('should handle addLineItem operation', () => {
        const input = generateMock(z.AddLineItemInputSchema());
        const document = utils.createDocument({
            state: {
                global: {
                    accounts: [
                        {
                            name: 'Account 1',
                            address: input.accountId,
                            lineItems: [],
                        },
                    ],
                },
                local: {},
            },
        });
        const updatedDocument = reducer(document, creators.addLineItem(input));

        expect(updatedDocument.operations.global).toHaveLength(1);
        expect(updatedDocument.operations.global[0].type).toBe('ADD_LINE_ITEM');
        expect(updatedDocument.operations.global[0].input).toStrictEqual(input);
        expect(updatedDocument.operations.global[0].index).toEqual(0);
    });

    it('should handle updateLineItem operation', () => {
        const input = generateMock(z.UpdateLineItemInputSchema());
        const lineItem = createLineItem({
            // @ts-expect-error mock
            category: input.category,
            // @ts-expect-error mock
            group: input.group,
        });
        const document = utils.createDocument({
            // @ts-expect-error mock
            state: {
                global: {
                    accounts: [
                        {
                            name: 'Account 1',
                            address: input.accountId,
                            lineItems: [lineItem],
                        },
                    ],
                },
            },
        });
        const updatedDocument = reducer(
            document,
            creators.updateLineItem(input),
        );

        expect(updatedDocument.operations.global).toHaveLength(1);
        expect(updatedDocument.operations.global[0].type).toBe(
            'UPDATE_LINE_ITEM',
        );
        expect(updatedDocument.operations.global[0].input).toStrictEqual(input);
        expect(updatedDocument.operations.global[0].index).toEqual(0);
    });

    it('should handle deleteLineItem operation', () => {
        const input = generateMock(z.DeleteLineItemInputSchema());
        const lineItem = createLineItem({
            // @ts-expect-error mock
            category: input.category,
            // @ts-expect-error mock
            group: input.group,
        });
        const document = utils.createDocument({
            // @ts-expect-error mock
            state: {
                global: {
                    accounts: [
                        {
                            name: 'Account 1',
                            address: input.accountId,
                            lineItems: [lineItem],
                        },
                    ],
                },
            },
        });
        const updatedDocument = reducer(
            document,
            creators.deleteLineItem(input),
        );

        expect(updatedDocument.operations.global).toHaveLength(1);
        expect(updatedDocument.operations.global[0].type).toBe(
            'DELETE_LINE_ITEM',
        );
        expect(updatedDocument.operations.global[0].input).toStrictEqual(input);
        expect(updatedDocument.operations.global[0].index).toEqual(0);
    });

    it('should handle sortLineItems operation', () => {
        const input = generateMock(z.SortLineItemsInputSchema());
        const document = utils.createDocument({
            state: {
                global: {
                    accounts: [
                        {
                            name: 'Account 1',
                            address: input.accountId,
                            lineItems: [],
                        },
                    ],
                },
                local: {},
            },
        });
        const updatedDocument = reducer(
            document,
            creators.sortLineItems(input),
        );

        expect(updatedDocument.operations.global).toHaveLength(1);
        expect(updatedDocument.operations.global[0].type).toBe(
            'SORT_LINE_ITEMS',
        );
        expect(updatedDocument.operations.global[0].input).toStrictEqual(input);
        expect(updatedDocument.operations.global[0].index).toEqual(0);
    });
});
