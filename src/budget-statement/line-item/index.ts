import { createAction } from '../../document';
import { LineItemInput, LineItem } from '../types';
import { createLineItem } from '../utils';
import {
    ADD_LINE_ITEM,
    AddLineItemAction,
    DELETE_LINE_ITEM,
    DeleteLineItemAction,
    UPDATE_LINE_ITEM,
    UpdateLineItemAction,
} from './types';

export * from './types';

export const addLineItem = (lineItems: LineItemInput[]) =>
    createAction<AddLineItemAction>(ADD_LINE_ITEM, {
        lineItems: lineItems.map(createLineItem),
    });

export const updateLineItem = (lineItems: LineItemInput[]) =>
    createAction<UpdateLineItemAction>(UPDATE_LINE_ITEM, { lineItems });

export const deleteLineItem = (
    lineItems: Pick<LineItem, 'category' | 'group'>[]
) => createAction<DeleteLineItemAction>(DELETE_LINE_ITEM, { lineItems });
