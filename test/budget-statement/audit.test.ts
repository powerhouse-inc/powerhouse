import fs from 'fs';
import JSZip from 'jszip';
import { reducer } from '../../src/budget-statement';
import {
    createBudgetStatement,
    loadBudgetStatementFromFile,
    saveBudgetStatementToFile,
} from '../../src/budget-statement/custom/utils';
import {
    addAuditReport,
    deleteAuditReport,
} from '../../src/budget-statement/gen';
import { getLocalFile, getRemoteFile } from '../../src/document/utils';
import { readFile } from '../../src/document/utils/node';

describe('Budget Statement Audit Report reducer', () => {
    const tempDir = './test/budget-statement/temp/audit/';
    const tempFile = `${tempDir}report.pdf`;

    beforeAll(() => {
        if (!fs.existsSync(tempDir))
            fs.mkdirSync(tempDir, {
                recursive: true,
            });
        fs.writeFileSync(tempFile, 'TEST');
    });

    afterAll(() => {
        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('should start as empty array', async () => {
        const state = createBudgetStatement();
        expect(state.state.auditReports).toStrictEqual([]);
    });

    it('should add audit report', async () => {
        const state = createBudgetStatement();
        const file = await getLocalFile(tempFile);
        const newState = reducer(
            state,
            await addAuditReport([
                {
                    report: file,
                    status: 'Approved',
                    timestamp: '2023-03-15T17:46:22.754Z',
                },
            ])
        );
        expect(newState.state.auditReports[0]).toStrictEqual({
            report: 'attachment://audits/Q1pqSc2iiEdpNLjRefhjnQ3nNc8=',
            status: 'Approved',
            timestamp: '2023-03-15T17:46:22.754Z',
        });
        expect(state.state.auditReports).toStrictEqual([]);
    });

    it('should add attachment to file registry', async () => {
        const state = createBudgetStatement();
        const file = await getLocalFile(tempFile);
        const newState = reducer(
            state,
            await addAuditReport([
                {
                    report: file,
                    status: 'Approved',
                    timestamp: '2023-03-15T17:46:22.754Z',
                },
            ])
        );

        expect(
            newState.fileRegistry[
                'attachment://audits/Q1pqSc2iiEdpNLjRefhjnQ3nNc8='
            ]
        ).toStrictEqual({
            data: 'VEVTVA==',
            mimeType: 'application/pdf',
            extension: 'pdf',
            fileName: 'report.pdf',
        });
        expect(state.fileRegistry).toStrictEqual({});
    });

    it('should delete audit report', async () => {
        let state = createBudgetStatement();
        const file = await getLocalFile(tempFile);
        state = reducer(
            state,
            await addAuditReport([
                {
                    report: file,
                    status: 'Escalated',
                    timestamp: '2023-03-15T17:46:22.754Z',
                },
            ])
        );
        state = reducer(
            state,
            deleteAuditReport([
                'attachment://audits/Q1pqSc2iiEdpNLjRefhjnQ3nNc8=',
            ])
        );
        expect(state.state.auditReports).toStrictEqual([]);
    });

    it('should set default timestamp on audit report', async () => {
        const state = createBudgetStatement();
        const date = new Date();
        const file = await getLocalFile(tempFile);
        const newState = reducer(
            state,
            await addAuditReport([
                {
                    report: file,
                    status: 'Approved',
                },
            ])
        );
        expect(
            newState.state.auditReports[0].timestamp >= date.toISOString()
        ).toBe(true);
    });

    it('should add approved audit report', async () => {
        const file = await getLocalFile(tempFile);
        const state = reducer(
            createBudgetStatement(),
            await addAuditReport([
                {
                    report: file,
                    status: 'Approved',
                },
            ])
        );
        expect(state.state.auditReports[0].status).toBe('Approved');
    });

    it('should add approved with comments audit report', async () => {
        const file = await getLocalFile(tempFile);
        const state = reducer(
            createBudgetStatement(),
            await addAuditReport([
                {
                    report: file,
                    status: 'ApprovedWithComments',
                },
            ])
        );
        expect(state.state.auditReports[0].status).toBe('ApprovedWithComments');
    });

    it('should add needs action audit report', async () => {
        const file = await getLocalFile(tempFile);
        const state = reducer(
            createBudgetStatement(),
            await addAuditReport([
                {
                    report: file,
                    status: 'NeedsAction',
                },
            ])
        );
        expect(state.state.auditReports[0].status).toBe('NeedsAction');
    });

    it('should throw if duplicated audit report', async () => {
        let state = createBudgetStatement();
        const file = await getLocalFile(tempFile);
        state = reducer(
            state,
            await addAuditReport([
                {
                    report: file,
                    status: 'Approved',
                    timestamp: '2023-03-15T17:46:22.754Z',
                },
            ])
        );
        await expect(async () =>
            reducer(
                state,
                await addAuditReport([
                    {
                        report: file,
                        status: 'Approved',
                        timestamp: '2023-03-15T17:46:22.754Z',
                    },
                ])
            )
        ).rejects.toThrow();
    });

    it('should fetch attachment from URL', async () => {
        const file = await getRemoteFile(
            'https://makerdao.com/whitepaper/DaiDec17WP.pdf'
        );
        const state = createBudgetStatement();
        const newState = reducer(
            state,
            await addAuditReport([
                {
                    report: file,
                    status: 'Approved',
                    timestamp: '2023-03-15T17:46:22.754Z',
                },
            ])
        );
        expect(newState.state.auditReports[0]).toStrictEqual({
            report: 'attachment://audits/Pv/RLgAirXe5QEWGG+W4PTlQCv0=',
            status: 'Approved',
            timestamp: '2023-03-15T17:46:22.754Z',
        });
        expect(
            newState.fileRegistry[
                'attachment://audits/Pv/RLgAirXe5QEWGG+W4PTlQCv0='
            ].data.length
        ).toBeGreaterThan(0);
        expect(
            newState.fileRegistry[
                'attachment://audits/Pv/RLgAirXe5QEWGG+W4PTlQCv0='
            ].mimeType
        ).toBe('application/pdf');
        expect(state.state.auditReports).toStrictEqual([]);
        expect(state.fileRegistry).toStrictEqual({});
    });

    it('should save attachment to zip', async () => {
        const attachment = await getLocalFile(tempFile);
        const state = reducer(
            createBudgetStatement({ name: 'march' }),
            await addAuditReport([
                {
                    report: attachment,
                    status: 'NeedsAction',
                },
            ])
        );
        const zipPath = await saveBudgetStatementToFile(state, tempDir);
        const file = readFile(zipPath);
        const zip = new JSZip();
        await zip.loadAsync(file);

        const report = state.state.auditReports[0].report;
        const path = report.slice('attachment://'.length);
        const attachmentZip = zip.file(path);

        const { data, ...attributes } = state.fileRegistry[report];
        expect(await attachmentZip?.async('string')).toBe('TEST');
        expect(JSON.parse(attachmentZip?.comment ?? '')).toStrictEqual(
            attributes
        );
    });

    it('should load attachment from zip', async () => {
        const attachment = await getLocalFile(tempFile);
        const state = await loadBudgetStatementFromFile(
            `${tempDir}march.phbs.zip`
        );
        expect(state.state.auditReports[0].status).toBe('NeedsAction');
        expect(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (state.operations[0] as any).input.reports[0].report.startsWith(
                'attachment://'
            )
        ).toBe(true);
        expect(
            state.fileRegistry[state.state.auditReports[0].report]
        ).toStrictEqual(attachment);
    });
});
