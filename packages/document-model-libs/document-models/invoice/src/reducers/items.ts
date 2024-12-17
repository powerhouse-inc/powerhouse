/**
 * This is a scaffold file meant for customization:
 * - modify it by implementing the reducer functions
 * - delete the file and run the code generator again to have it reset
 */

import { InvoiceLineItem } from 'document-models/invoice';
import { InvoiceItemsOperations } from '../../gen/items/operations';

export const reducer: InvoiceItemsOperations = {
    addLineItemOperation(state, action, dispatch) {
        try {
            const item = {
                ...action.input,
            };

            if (state.lineItems.find((x) => x.id === item.id))
                throw new Error('Duplicate input.id');

            validatePrices(item);

            state.lineItems.push(item);
        } catch (e) {
            console.error(e);
        }
    },

    editLineItemOperation(state, action, dispatch) {
        try {
            const stateItem = state.lineItems.find(
                (x) => x.id === action.input.id,
            );
            if (!stateItem) throw new Error('Item matching input.id not found');

            const sanitizedInput = Object.fromEntries(
                Object.entries(action.input).filter(
                    ([, value]) => value !== null,
                ),
            ) as Partial<InvoiceLineItem>;

            const nextItem: InvoiceLineItem = {
                ...stateItem,
                ...sanitizedInput,
            };

            validatePrices(nextItem);
            Object.assign(stateItem, nextItem);
        } catch (e) {
            console.error(e);
        }
    },

    deleteLineItemOperation(state, action, dispatch) {
        try {
            state.lineItems = state.lineItems.filter(
                (x) => x.id !== action.input.id,
            );
        } catch (e) {
            console.error(e);
        }
    },
};

function validatePrices(item: InvoiceLineItem) {
    // Calculate total prices from unit prices and quantity
    const calcPriceIncl = item.quantity * item.unitPriceTaxIncl;
    const calcPriceExcl = item.quantity * item.unitPriceTaxExcl;

    // Validate that calculated totals match input totals
    if (calcPriceIncl !== item.totalPriceTaxIncl) {
        throw new Error(
            'Calculated unitPriceTaxIncl does not match input total',
        );
    }

    if (calcPriceExcl !== item.totalPriceTaxExcl) {
        throw new Error(
            'Calculated unitPriceTaxExcl does not match input total',
        );
    }

    // Convert tax percentage to decimal rate
    const taxRate = item.taxPercent / 100;

    // Validate unit prices (tax-exclusive should equal tax-inclusive / (1 + taxRate))
    const expectedUnitPriceExcl = (
        item.unitPriceTaxIncl /
        (1 + taxRate)
    ).toFixed(2);
    if (item.unitPriceTaxExcl.toFixed(2) !== expectedUnitPriceExcl) {
        throw new Error(
            'Tax inclusive/exclusive unit prices failed comparison.',
        );
    }

    // Validate total prices using the same formula
    const expectedTotalPriceExcl = (calcPriceIncl / (1 + taxRate)).toFixed(2);
    if (calcPriceExcl.toFixed(2) !== expectedTotalPriceExcl) {
        throw new Error('Tax inclusive/exclusive totals failed comparison.');
    }
}
