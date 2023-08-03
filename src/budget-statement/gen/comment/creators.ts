import { createAction } from '../../../document/utils';


import {
    AddCommentInput,
    UpdateCommentInput,
    DeleteCommentInput,
} from '@acaldas/document-model-graphql/budget-statement';

import {
    AddCommentAction,
    UpdateCommentAction,
    DeleteCommentAction,
} from './actions';

export const addComment = (input: AddCommentInput) =>
    createAction<AddCommentAction>(
        'ADD_COMMENT',
        {...input}
    );

export const updateComment = (input: UpdateCommentInput) =>
    createAction<UpdateCommentAction>(
        'UPDATE_COMMENT',
        {...input}
    );

export const deleteComment = (input: DeleteCommentInput) =>
    createAction<DeleteCommentAction>(
        'DELETE_COMMENT',
        {...input}
    );


