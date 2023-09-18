import { reducer } from '../../document-models/budget-statement';
import {
    addComment,
    deleteComment,
    updateComment,
} from '../../document-models/budget-statement/gen/creators';
import utils from '../../document-models/budget-statement/gen/utils';

const { createDocument } = utils;

describe('Budget Statement Comment reducer', () => {
    it('should start as empty array', async () => {
        const document = createDocument();
        expect(document.state.comments).toStrictEqual([]);
    });

    it('should add comment', async () => {
        const document = createDocument();
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
        expect(newDocument.state.comments[0]).toStrictEqual({
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
        expect(document.state.comments).toStrictEqual([]);
    });

    it('should update comment', async () => {
        let document = createDocument();
        document = reducer(
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

        jest.useFakeTimers({ now: new Date('2023-03-16') });
        document = reducer(
            document,
            updateComment({ key: '123', comment: 'Test 2' }),
        );
        expect(document.state.comments[0]).toStrictEqual({
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

    it('should delete comment', async () => {
        let document = createDocument();
        document = reducer(
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

        document = reducer(document, deleteComment({ comment: '123' }));
        expect(document.state.comments.length).toBe(0);
    });

    it('should generate comment key and timestamp if undefined', async () => {
        jest.useFakeTimers({ now: new Date('2023-03-16') });
        const document = createDocument();
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
        expect(newDocument.state.comments[0].key.length).toBe(28);
        expect(newDocument.state.comments[0].timestamp).toBe(
            '2023-03-16T00:00:00.000Z',
        );
    });

    it('should sort comments by timestamp', async () => {
        const document = createDocument();
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

        expect(newDocument.state.comments[0].comment).toBe('03/11');
        expect(newDocument.state.comments[1].comment).toBe('03/13');
        expect(newDocument.state.comments[2].comment).toBe('03/15');
    });

    it('should throw if comment key already exists', async () => {
        let document = createDocument();
        document = reducer(
            document,
            addComment({
                key: '123',
                comment: '03/15',
            }),
        );
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

    it('should ignore non existing keys on update', async () => {
        let document = createDocument();
        document = reducer(
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

        expect(document.state.comments).toStrictEqual([
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
});
