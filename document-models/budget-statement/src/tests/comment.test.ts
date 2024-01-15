/**
 * This is a scaffold file meant for customization:
 * - change it by adding new tests or modifying the existing ones
 */

import { generateMock } from '@powerhousedao/codegen';

import * as creators from '../../gen/comment/creators';
import { reducer } from '../../gen/reducer';
import { z } from '../../gen/schema';
import { BudgetStatementDocument } from '../../gen/types';
import utils from '../../gen/utils';

const { addComment, updateComment, deleteComment } = creators;
const { createDocument } = utils;

describe('Budget Statement Comment reducer', () => {
    let document: BudgetStatementDocument;

    beforeEach(() => {
        document = createDocument();
    });

    it('should start as empty array', () => {
        expect(document.state.global.comments).toStrictEqual([]);
    });

    it('should add comment', () => {
        const newDocument = reducer(
            document,
            addComment({
                key: '123',
                comment: 'Test',
                status: 'Escalated',
                timestamp: '2023-03-15T17:46:22.754Z',
                author: {
                    ref: 'makerdao/user',
                    id: 'TEST-001',
                    username: 'liberuum',
                    roleLabel: 'Auditor',
                },
            }),
        );
        expect(newDocument.state.global.comments[0]).toStrictEqual({
            key: '123',
            comment: 'Test',
            status: 'Escalated',
            timestamp: '2023-03-15T17:46:22.754Z',
            author: {
                ref: 'makerdao/user',
                id: 'TEST-001',
                username: 'liberuum',
                roleLabel: 'Auditor',
            },
        });
        expect(document.state.global.comments).toStrictEqual([]);
    });

    it('should update comment', () => {
        const document = createDocument({
            state: {
                global: {
                    comments: [
                        {
                            key: '123',
                            comment: 'Test',
                            status: 'Escalated',
                            timestamp: '2023-03-15T17:46:22.754Z',
                            author: {
                                ref: 'makerdao/user',
                                id: 'TEST-001',
                                username: 'liberuum',
                                roleLabel: 'Auditor',
                            },
                        },
                    ],
                },
                local: {},
            },
        });

        vi.useFakeTimers({ now: new Date('2023-03-16') });
        const updatedDocument = reducer(
            document,
            updateComment({ key: '123', comment: 'Test 2' }),
        );
        expect(updatedDocument.state.global.comments[0]).toStrictEqual({
            key: '123',
            comment: 'Test 2',
            status: 'Escalated',
            timestamp: new Date('2023-03-16').toISOString(),
            author: {
                ref: 'makerdao/user',
                id: 'TEST-001',
                username: 'liberuum',
                roleLabel: 'Auditor',
            },
        });
    });

    it('should delete comment', () => {
        const document = createDocument({
            state: {
                global: {
                    comments: [
                        {
                            key: '123',
                            comment: 'Test',
                            status: 'Escalated',
                            timestamp: '2023-03-15T17:46:22.754Z',
                            author: {
                                ref: 'makerdao/user',
                                id: 'TEST-001',
                                username: 'liberuum',
                                roleLabel: 'Auditor',
                            },
                        },
                    ],
                },
                local: {},
            },
        });
        const updatedDocument = reducer(
            document,
            deleteComment({ comment: '123' }),
        );
        expect(updatedDocument.state.global.comments.length).toBe(0);
    });

    it('should generate comment key and timestamp if undefined', () => {
        vi.useFakeTimers({ now: new Date('2023-03-16') });
        const newDocument = reducer(
            document,
            addComment({
                comment: 'Test',
                status: 'Escalated',
                author: {
                    ref: 'makerdao/user',
                    id: 'TEST-001',
                    username: 'liberuum',
                    roleLabel: 'Auditor',
                },
            }),
        );
        expect(newDocument.state.global.comments[0].key.length).toBe(28);
        expect(newDocument.state.global.comments[0].timestamp).toBe(
            '2023-03-16T00:00:00.000Z',
        );
    });

    it('should sort comments by timestamp', () => {
        let newDocument = reducer(
            document,
            addComment({
                comment: '03/11',
                timestamp: '2023-03-11T17:46:22.754Z',
            }),
        );
        newDocument = reducer(
            newDocument,
            addComment({
                comment: '03/15',
                timestamp: '2023-03-15T17:46:22.754Z',
            }),
        );
        newDocument = reducer(
            newDocument,
            addComment({
                comment: '03/13',
                timestamp: '2023-03-13T17:46:22.754Z',
            }),
        );

        expect(newDocument.state.global.comments[0].comment).toBe('03/11');
        expect(newDocument.state.global.comments[1].comment).toBe('03/13');
        expect(newDocument.state.global.comments[2].comment).toBe('03/15');
    });

    it('should throw if comment key already exists', () => {
        const document = createDocument({
            state: {
                global: {
                    comments: [
                        // @ts-expect-error mock
                        {
                            key: '123',
                            comment: '03/15',
                        },
                    ],
                },
            },
        });
        expect(() =>
            reducer(
                document,
                addComment({
                    key: '123',
                    comment: '03/13',
                }),
            ),
        ).toThrow();
    });

    it('should ignore non existing keys on update', () => {
        let document = createDocument({
            state: {
                global: {
                    comments: [
                        {
                            key: '123',
                            comment: 'Test',
                            status: 'Escalated',
                            timestamp: '2023-03-15T17:46:22.754Z',
                            author: {
                                ref: 'makerdao/user',
                                id: 'TEST-001',
                                username: 'liberuum',
                                roleLabel: 'Auditor',
                            },
                        },
                    ],
                },
                local: {},
            },
        });

        document = reducer(
            document,
            updateComment({
                key: '123',
                status: 'Final',
                timestamp: '2023-03-15T17:46:22.754Z',
            }),
        );
        document = reducer(
            document,
            updateComment({
                key: '456',
                comment: '03/15',
            }),
        );

        expect(document.state.global.comments).toStrictEqual([
            {
                key: '123',
                comment: 'Test',
                status: 'Final',
                timestamp: '2023-03-15T17:46:22.754Z',
                author: {
                    ref: 'makerdao/user',
                    id: 'TEST-001',
                    username: 'liberuum',
                    roleLabel: 'Auditor',
                },
            },
        ]);
    });

    it('should handle addComment operation', () => {
        const input = generateMock(z.AddCommentInputSchema());
        const updatedDocument = reducer(document, creators.addComment(input));

        expect(updatedDocument.operations.global).toHaveLength(1);
        expect(updatedDocument.operations.global[0].type).toBe('ADD_COMMENT');
        expect(updatedDocument.operations.global[0].input).toStrictEqual(input);
        expect(updatedDocument.operations.global[0].index).toEqual(0);
    });

    it('should handle updateComment operation', () => {
        const input = generateMock(z.UpdateCommentInputSchema());
        const updatedDocument = reducer(
            document,
            creators.updateComment(input),
        );

        expect(updatedDocument.operations.global).toHaveLength(1);
        expect(updatedDocument.operations.global[0].type).toBe(
            'UPDATE_COMMENT',
        );
        expect(updatedDocument.operations.global[0].input).toStrictEqual(input);
        expect(updatedDocument.operations.global[0].index).toEqual(0);
    });

    it('should handle deleteComment operation', () => {
        const input = generateMock(z.DeleteCommentInputSchema());
        const updatedDocument = reducer(
            document,
            creators.deleteComment(input),
        );

        expect(updatedDocument.operations.global).toHaveLength(1);
        expect(updatedDocument.operations.global[0].type).toBe(
            'DELETE_COMMENT',
        );
        expect(updatedDocument.operations.global[0].input).toStrictEqual(input);
        expect(updatedDocument.operations.global[0].index).toEqual(0);
    });
});
