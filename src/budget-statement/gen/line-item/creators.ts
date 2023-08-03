import { createAction } from '../../../document/utils';


import {
    AddLineItemInput,
    UpdateLineItemInput,
    DeleteLineItemInput,
    SortLineItemsInput,
} from '@acaldas/document-model-graphql/budget-statement';

import {
    AddLineItemAction,
    UpdateLineItemAction,
    DeleteLineItemAction,
    SortLineItemsAction,
} from './actions';

export const addLineItem = (input: AddLineItemInput) =>
    createAction<AddLineItemAction>(
        'ADD_LINE_ITEM',
        {...input}
    );

export const updateLineItem = (input: UpdateLineItemInput) =>
    createAction<UpdateLineItemAction>(
        'UPDATE_LINE_ITEM',
        {...input}
    );

export const deleteLineItem = (input: DeleteLineItemInput) =>
    createAction<DeleteLineItemAction>(
        'DELETE_LINE_ITEM',
        {...input}
    );

export const sortLineItems = (input: SortLineItemsInput) =>
    createAction<SortLineItemsAction>(
        'SORT_LINE_ITEMS',
        {...input}
    );


