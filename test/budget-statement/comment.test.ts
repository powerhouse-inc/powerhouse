import { reducer } from '../../src/budget-statement';
import { createBudgetStatement } from '../../src/budget-statement/custom/utils';
import {
    addComment,
    deleteComment,
    updateComment,
} from '../../src/budget-statement/gen';

describe('Budget Statement Comment reducer', () => {
    it('should start as empty array', async () => {
        const state = createBudgetStatement();
        expect(state.state.comments).toStrictEqual([]);
    });

    it('should add comment', async () => {
        const state = createBudgetStatement();
        const newState = reducer(
            state,
            addComment([
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
            ])
        );
        expect(newState.state.comments[0]).toStrictEqual({
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
        expect(state.state.comments).toStrictEqual([]);
    });

    it('should update comment', async () => {
        let state = createBudgetStatement();
        state = reducer(
            state,
            addComment([
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
            ])
        );

        jest.useFakeTimers({ now: new Date('2023-03-16') });
        state = reducer(
            state,
            updateComment([{ key: '123', comment: 'Test 2' }])
        );
        expect(state.state.comments[0]).toStrictEqual({
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
        let state = createBudgetStatement();
        state = reducer(
            state,
            addComment([
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
            ])
        );

        state = reducer(state, deleteComment(['123']));
        expect(state.state.comments.length).toBe(0);
    });

    it('should generate comment key and timestamp if undefined', async () => {
        jest.useFakeTimers({ now: new Date('2023-03-16') });
        const state = createBudgetStatement();
        const newState = reducer(
            state,
            addComment([
                {
                    comment: 'Test',
                    status: 'Escalated',
                    author: {
                        ref: 'makerdao/user',
                        id: 'TEST-001',
                        username: 'liberuum',
                        roleLabel: 'Auditor',
                    },
                },
            ])
        );
        expect(newState.state.comments[0].key.length).toBe(28);
        expect(newState.state.comments[0].timestamp).toBe(
            '2023-03-16T00:00:00.000Z'
        );
    });

    it('should sort comments by timestamp', async () => {
        const state = createBudgetStatement();
        const newState = reducer(
            state,
            addComment([
                {
                    comment: '03/11',
                    timestamp: '2023-03-11T17:46:22.754Z',
                },
                {
                    comment: '03/15',
                    timestamp: '2023-03-15T17:46:22.754Z',
                },
                {
                    comment: '03/13',
                    timestamp: '2023-03-13T17:46:22.754Z',
                },
            ])
        );
        expect(newState.state.comments[0].comment).toBe('03/11');
        expect(newState.state.comments[1].comment).toBe('03/13');
        expect(newState.state.comments[2].comment).toBe('03/15');
    });

    it('should throw if comment key already exists', async () => {
        const state = createBudgetStatement();
        expect(() =>
            reducer(
                state,
                addComment([
                    {
                        key: '123',
                        comment: '03/15',
                    },
                    {
                        key: '123',
                        comment: '03/13',
                    },
                ])
            )
        ).toThrow();
    });

    it('should ignore non existing keys on update', async () => {
        let state = createBudgetStatement();
        state = reducer(
            state,
            addComment([
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
            ])
        );

        state = reducer(
            state,
            updateComment([
                {
                    key: '123',
                    status: 'Final',
                    timestamp: '2023-03-15T17:46:22.754Z',
                },
                {
                    key: '456',
                    comment: '03/15',
                },
            ])
        );

        expect(state.state.comments).toStrictEqual([
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
