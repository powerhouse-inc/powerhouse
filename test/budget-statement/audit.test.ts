import fs from 'fs';
import {
    addAuditReport,
    createBudgetStatement,
    deleteAuditReport,
    reducer,
} from '../../src/budget-statement';

describe('Budget Statement Audit Report reducer', () => {
    const tempDir = './test/budget-statement/temp/';
    const tempFile = `${tempDir}report.pdf`;

    beforeAll(() => {
        if (!fs.existsSync(tempDir))
            fs.mkdirSync(tempDir, {
                recursive: true,
            });
        fs.writeFileSync(tempFile, 'TEST');
    });

    afterAll(() => {
        fs.unlinkSync(tempFile);
    });

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
                    report: tempFile,
                    status: 'Approved',
                    timestamp: '2023-03-15T17:46:22.754Z',
                },
            ])
        );
        expect(newState.data.auditReports[0]).toStrictEqual({
            report: 'attachment://2023-03-15T17:46:22.754Z',
            status: 'Approved',
            timestamp: '2023-03-15T17:46:22.754Z',
        });
        expect(state.data.auditReports).toStrictEqual([]);
    });

    it('should add attachment to file registry', async () => {
        const state = createBudgetStatement();
        const newState = reducer(
            state,
            await addAuditReport([
                {
                    report: tempFile,
                    status: 'Approved',
                    timestamp: '2023-03-15T17:46:22.754Z',
                },
            ])
        );

        expect(
            newState.fileRegistry['attachment://2023-03-15T17:46:22.754Z']
        ).toStrictEqual({ data: 'VEVTVA==', mimeType: 'application/pdf' });
        expect(state.fileRegistry).toStrictEqual({});
    });

    it('should delete audit report', async () => {
        let state = createBudgetStatement();
        state = reducer(
            state,
            await addAuditReport([
                {
                    report: tempFile,
                    status: 'Escalated',
                    timestamp: '2023-03-15T17:46:22.754Z',
                },
            ])
        );
        state = reducer(
            state,
            deleteAuditReport(['attachment://2023-03-15T17:46:22.754Z'])
        );
        expect(state.data.auditReports).toStrictEqual([]);
    });

    it('should set default timestamp on audit report', async () => {
        const state = createBudgetStatement();
        const date = new Date();
        const newState = reducer(
            state,
            await addAuditReport([
                {
                    report: tempFile,
                    status: 'Approved',
                },
            ])
        );
        expect(
            newState.data.auditReports[0].timestamp >= date.toISOString()
        ).toBe(true);
    });

    it('should add approved audit report', async () => {
        const state = reducer(
            createBudgetStatement(),
            await addAuditReport([
                {
                    report: tempFile,
                    status: 'Approved',
                },
            ])
        );
        expect(state.data.auditReports[0].status).toBe('Approved');
    });

    it('should add approved with comments audit report', async () => {
        const state = reducer(
            createBudgetStatement(),
            await addAuditReport([
                {
                    report: tempFile,
                    status: 'ApprovedWithComments',
                },
            ])
        );
        expect(state.data.auditReports[0].status).toBe('ApprovedWithComments');
    });

    it('should add needs action audit report', async () => {
        const state = reducer(
            createBudgetStatement(),
            await addAuditReport([
                {
                    report: tempFile,
                    status: 'NeedsAction',
                },
            ])
        );
        expect(state.data.auditReports[0].status).toBe('NeedsAction');
    });

    it('should fetch attachment from URL', async () => {
        const state = createBudgetStatement();
        const newState = reducer(
            state,
            await addAuditReport([
                {
                    report: 'https://makerdao.com/whitepaper/DaiDec17WP.pdf',
                    status: 'Approved',
                    timestamp: '2023-03-15T17:46:22.754Z',
                },
            ])
        );
        expect(newState.data.auditReports[0]).toStrictEqual({
            report: 'attachment://2023-03-15T17:46:22.754Z',
            status: 'Approved',
            timestamp: '2023-03-15T17:46:22.754Z',
        });
        expect(
            newState.fileRegistry['attachment://2023-03-15T17:46:22.754Z'].data
                .length
        ).toBeGreaterThan(0);
        expect(
            newState.fileRegistry['attachment://2023-03-15T17:46:22.754Z']
                .mimeType
        ).toBe('application/pdf');
        expect(state.data.auditReports).toStrictEqual([]);
        expect(state.fileRegistry).toStrictEqual({});
    });
});
