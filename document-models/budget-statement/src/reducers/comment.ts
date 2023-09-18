/**
 * This is a scaffold file meant for customization:
 * - modify it by implementing the reducer functions
 * - delete the file and run the code generator again to have it reset
 */

import { utils } from 'document-model/document';
import { BudgetStatementCommentOperations } from '../../gen/comment/operations';
import { Comment } from '../../gen/schema';

const sortComment = (a: Comment, b: Comment) =>
    a.timestamp < b.timestamp ? -1 : 1;

export const reducer: BudgetStatementCommentOperations = {
    addCommentOperation(state, action) {
        const { input } = action;
        const key = input.key ?? utils.hashKey();

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
        state.comments.sort(sortComment);
    },
    updateCommentOperation(state, action) {
        const { input } = action;
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
        state.comments.sort(sortComment);
    },
    deleteCommentOperation(state, action) {
        const { input } = action;
        state.comments = state.comments.filter(
            comment => input.comment !== comment.key,
        );
    },
};
