import {
    addAuditReport,
    createBudgetStatement,
    deleteAuditReport,
    reducer,
} from '../../src/budget-statement';

describe('Budget Statement Audit Report reducer', () => {
    it('should start as empty array', async () => {
        const state = createBudgetStatement();
        expect(state.data.auditReports).toStrictEqual([]);
    });

    it('should add audit report', async () => {
        const state = createBudgetStatement();
        const newState = reducer(
            state,
            await addAuditReport([
                {
                    report: 'attachment://audit.pdf',
                    status: 'Approved',
                    timestamp: '2023-03-15T17:46:22.754Z',
                },
            ])
        );
        expect(newState.data.auditReports[0]).toStrictEqual({
            report: 'attachment://audit.pdf',
            status: 'Approved',
            timestamp: '2023-03-15T17:46:22.754Z',
        });
        expect(state.data.auditReports).toStrictEqual([]);
    });

    it('should delete audit report', async () => {
        let state = createBudgetStatement();
        state = reducer(
            state,
            await addAuditReport([
                {
                    report: 'attachment://audit.pdf',
                    status: 'Escalated',
                },
            ])
        );
        state = reducer(state, deleteAuditReport(['attachment://audit.pdf']));
        expect(state.data.auditReports).toStrictEqual([]);
    });

    it('should set default timestamp on audit report', async () => {
        const state = createBudgetStatement();
        const date = new Date();
        const newState = reducer(
            state,
            addAuditReport([
                {
                    report: 'attachment://audit.pdf',
                    status: 'Approved',
                },
            ])
        );
        expect(
            newState.data.auditReports[0].timestamp >= date.toISOString()
        ).toBe(true);
    });

    it('should approve audit report', async () => {
        let state = createBudgetStatement();
        state = reducer(
            state,
            addAuditReport([
                {
                    report: 'attachment://audit.pdf',
                    status: 'Escalated',
                },
            ])
        );
        const newState = reducer(
            state,
            approveAuditReport([{ report: 'attachment://audit.pdf' }])
        );
        expect(newState.data.auditReports[0].status).toBe('Approved');
        expect(state.data.auditReports[0].status).toBe('Escalated');
    });

    it('should approve with comments audit report', async () => {
        let state = createBudgetStatement();
        state = reducer(
            state,
            addAuditReport([
                {
                    report: 'attachment://audit.pdf',
                    status: 'Escalated',
                },
            ])
        );
        state = reducer(
            state,
            approveAuditReport([
                { report: 'attachment://audit.pdf', comment: 'Test' },
            ])
        );
        expect(state.data.auditReports[0].status).toBe('ApprovedWithComments');
    });

    it('should set needs action on audit report', async () => {
        let state = createBudgetStatement();
        state = reducer(
            state,
            addAuditReport([
                {
                    report: 'attachment://audit.pdf',
                    status: 'Escalated',
                },
            ])
        );
        state = reducer(
            state,
            setNeedsActionAuditReport(['attachment://audit.pdf'])
        );
        expect(state.data.auditReports[0].status).toBe('NeedsAction');
    });

    it('should escalate audit report', async () => {
        let state = createBudgetStatement();
        state = reducer(
            state,
            addAuditReport([
                {
                    report: 'attachment://audit.pdf',
                    status: 'NeedsAction',
                },
            ])
        );
        state = reducer(state, escalateAuditReport(['attachment://audit.pdf']));
        expect(state.data.auditReports[0].status).toBe('Escalated');
    });
});
