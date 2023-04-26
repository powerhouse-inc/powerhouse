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

export const addComment = (comments: Partial<Comment>[]) =>
    createAction<AddCommentAction>(ADD_COMMENT, { comments });

export const updateComment = (comments: CommentInput[]) =>
    createAction<UpdateCommentAction>(UPDATE_COMMENT, { comments });

export const deleteComment = (comments: Comment['key'][]) =>
    createAction<DeleteCommentAction>(DELETE_COMMENT, { comments });
