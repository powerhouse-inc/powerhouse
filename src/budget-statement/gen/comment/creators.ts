import {
    CommentUpdateInput,
    z,
} from '@acaldas/document-model-graphql/budget-statement';
import { createAction } from '../../../document/utils';
import { Comment, CommentInput } from '../../custom';
import {
    AddCommentAction,
    ADD_COMMENT,
    DeleteCommentAction,
    DELETE_COMMENT,
    UpdateCommentAction,
    UPDATE_COMMENT,
} from './types';

export const addComment = (comments: CommentInput[]) =>
    createAction<AddCommentAction>(
        ADD_COMMENT,
        { comments },
        z.AddCommentActionSchema
    );

export const updateComment = (comments: CommentUpdateInput[]) =>
    createAction<UpdateCommentAction>(
        UPDATE_COMMENT,
        { comments },
        z.UpdateCommentActionSchema
    );

export const deleteComment = (comments: Comment['key'][]) =>
    createAction<DeleteCommentAction>(
        DELETE_COMMENT,
        { comments },
        z.DeleteCommentActionSchema
    );
