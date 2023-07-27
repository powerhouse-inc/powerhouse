import { hashKey } from '../../../document/utils';
import {
    AddCommentAction,
    DeleteCommentAction,
    UpdateCommentAction,
} from '../../gen/comment/types';
import { BudgetStatementState, Comment } from '../types';

const sortComment = (a: Comment, b: Comment) =>
    a.timestamp < b.timestamp ? -1 : 1;

export const addCommentOperation = (
    state: BudgetStatementState,
    action: AddCommentAction
) => {
    action.input.comments.forEach(input => {
        const key = input.key ?? hashKey();

        const index = state.comments.findIndex(c => c.key === input.key);
        if (index > -1) {
            throw new Error(`Comment with key ${key} already exists`);
        }

        state.comments.push({
            key,
            author: {
                ref: null,
                id: null,
                username: null,
                roleLabel: null,
                ...input.author,
            },
            comment: input.comment,
            timestamp: input.timestamp || new Date().toISOString(),
            status: input.status ?? 'Draft',
        });
    });
    state.comments.sort(sortComment);
};

export const updateCommentOperation = (
    state: BudgetStatementState,
    action: UpdateCommentAction
) => {
    action.input.comments.forEach(input => {
        const index = state.comments.findIndex(c => c.key === input.key);
        if (index === -1) {
            return;
        }
        const comment = state.comments[index];
        state.comments[index] = {
            ...comment,
            ...input,
            author: {
                id: input.author?.id ?? comment.author.id,
                ref: input.author?.ref ?? comment.author.ref,
                roleLabel: input.author?.roleLabel ?? comment.author.roleLabel,
                username: input.author?.username ?? comment.author.username,
            },
            comment: input.comment ?? comment.comment,
            timestamp: input.timestamp ?? new Date().toISOString(),
            status: input.status ?? comment.status,
        };
    });
    state.comments.sort(sortComment);
};

export const deleteCommentOperation = (
    state: BudgetStatementState,
    action: DeleteCommentAction
) => {
    state.comments = state.comments.filter(
        comment => !action.input.comments.includes(comment.key)
    );
};
