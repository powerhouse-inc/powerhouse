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
        const document = createBudgetStatement();
        expect(document.state.auditReports).toStrictEqual([]);
    });

    it('should add audit report', async () => {
        const document = createBudgetStatement();
        const file = await getLocalFile(tempFile);
        const newDocument = reducer(
            document,
            addAuditReport(
                [
                    {
                        report: file.hash,
                        status: 'Approved',
                        timestamp: '2023-03-15T17:46:22.754Z',
                    },
                ],
                [file]
            )
        );
        expect(newDocument.state.auditReports[0]).toStrictEqual({
            report: 'Q1pqSc2iiEdpNLjRefhjnQ3nNc8=',
            status: 'Approved',
            timestamp: '2023-03-15T17:46:22.754Z',
        });
        expect(document.state.auditReports).toStrictEqual([]);
    });

    it('should add attachment to file registry', async () => {
        const document = createBudgetStatement();
        const file = await getLocalFile(tempFile);
        const newDocument = reducer(
            document,
            addAuditReport(
                [
                    {
                        report: file.hash,
                        status: 'Approved',
                        timestamp: '2023-03-15T17:46:22.754Z',
                    },
                ],
                [file]
            )
        );

        expect(
            newDocument.attachments['Q1pqSc2iiEdpNLjRefhjnQ3nNc8=']
        ).toStrictEqual({
            data: 'VEVTVA==',
            mimeType: 'application/pdf',
            extension: 'pdf',
            fileName: 'report.pdf',
        });
        expect(document.attachments).toStrictEqual({});
    });

    it('should delete audit report', async () => {
        let document = createBudgetStatement();
        const file = await getLocalFile(tempFile);
        document = reducer(
            document,
            addAuditReport(
                [
                    {
                        report: file.hash,
                        status: 'Escalated',
                        timestamp: '2023-03-15T17:46:22.754Z',
                    },
                ],
                [file]
            )
        );
        document = reducer(
            document,
            deleteAuditReport(['Q1pqSc2iiEdpNLjRefhjnQ3nNc8='])
        );
        expect(document.state.auditReports).toStrictEqual([]);
    });

    // it('should set default timestamp on audit report', async () => {
    //     const document = createBudgetStatement();
    //     const date = new Date();
    //     const file = await getLocalFile(tempFile);
    //
    //     const newDocument = reducer(
    //         document,
    //         addAuditReport(
    //             {
    //                 reports: [
    //                     {
    //                         report: hash,
    //                         status: 'Approved',
    //                     },
    //                 ],
    //             },
    //             [{ ...file, hash }]
    //         )
    //     );
    //     expect(
    //         newDocument.state.auditReports[0].timestamp >=
    //             date.toISOString()
    //     ).toBe(true);
    // });

    it('should add approved audit report', async () => {
        const file = await getLocalFile(tempFile);

        const document = reducer(
            createBudgetStatement(),
            addAuditReport(
                [
                    {
                        report: file.hash,
                        status: 'Approved',
                        timestamp: '2023-03-15T17:46:22.754Z',
                    },
                ],
                [file]
            )
        );
        expect(document.state.auditReports[0].status).toBe('Approved');
    });

    it('should add approved with comments audit report', async () => {
        const file = await getLocalFile(tempFile);

        const document = reducer(
            createBudgetStatement(),
            addAuditReport(
                [
                    {
                        report: file.hash,
                        status: 'ApprovedWithComments',
                        timestamp: '2023-03-15T17:46:22.754Z',
                    },
                ],
                [file]
            )
        );
        expect(document.state.auditReports[0].status).toBe(
            'ApprovedWithComments'
        );
    });

    it('should add needs action audit report', async () => {
        const file = await getLocalFile(tempFile);

        const document = reducer(
            createBudgetStatement(),
            addAuditReport(
                [
                    {
                        report: file.hash,
                        status: 'NeedsAction',
                        timestamp: '2023-03-15T17:46:22.754Z',
                    },
                ],
                [file]
            )
        );
        expect(document.state.auditReports[0].status).toBe('NeedsAction');
    });

    it('should throw if duplicated audit report', async () => {
        const file = await getLocalFile(tempFile);

        const document = reducer(
            createBudgetStatement(),
            addAuditReport(
                [
                    {
                        report: file.hash,
                        status: 'Approved',
                        timestamp: '2023-03-15T17:46:22.754Z',
                    },
                ],
                [file]
            )
        );

        await expect(async () =>
            reducer(
                document,
                addAuditReport(
                    [
                        {
                            report: file.hash,
                            status: 'Approved',
                            timestamp: '2023-03-15T17:46:22.754Z',
                        },
                    ],
                    [file]
                )
            )
        ).rejects.toThrow();
    });

    it('should fetch attachment from URL', async () => {
        const file = await getRemoteFile(
            'https://makerdao.com/whitepaper/DaiDec17WP.pdf'
        );

        const document = createBudgetStatement();
        const newDocument = reducer(
            document,
            addAuditReport(
                [
                    {
                        report: file.hash,
                        status: 'Approved',
                        timestamp: '2023-03-15T17:46:22.754Z',
                    },
                ],
                [file]
            )
        );
        expect(newDocument.state.auditReports[0]).toStrictEqual({
            report: 'Pv/RLgAirXe5QEWGG+W4PTlQCv0=',
            status: 'Approved',
            timestamp: '2023-03-15T17:46:22.754Z',
        });
        expect(
            newDocument.attachments['Pv/RLgAirXe5QEWGG+W4PTlQCv0='].data.length
        ).toBeGreaterThan(0);
        expect(
            newDocument.attachments['Pv/RLgAirXe5QEWGG+W4PTlQCv0='].mimeType
        ).toBe('application/pdf');
        expect(document.state.auditReports).toStrictEqual([]);
        expect(document.attachments).toStrictEqual({});
    });

    it('should save attachment to zip', async () => {
        const attachment = await getLocalFile(tempFile);
        const document = reducer(
            createBudgetStatement({ name: 'march' }),
            addAuditReport(
                [
                    {
                        report: attachment.hash,
                        status: 'NeedsAction',
                        timestamp: '2023-03-15T17:46:22.754Z',
                    },
                ],
                [attachment]
            )
        );
        const zipPath = await saveBudgetStatementToFile(document, tempDir);
        const file = readFile(zipPath);
        const zip = new JSZip();
        await zip.loadAsync(file);

        const report = document.state.auditReports[0].report;
        const path = report.slice(''.length);
        const attachmentZip = zip.file(path);

        const { data, ...attributes } = document.attachments[report];
        expect(await attachmentZip?.async('string')).toBe('TEST');
        expect(JSON.parse(attachmentZip?.comment ?? '')).toStrictEqual(
            attributes
        );
    });

    it('should load attachment from zip', async () => {
        const { hash, ...attachment } = await getLocalFile(tempFile);
        const document = await loadBudgetStatementFromFile(
            `${tempDir}march.phbs.zip`
        );
        expect(document.state.auditReports[0].status).toBe('NeedsAction');
        expect(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (document.operations[0] as any).input.reports[0].report.startsWith(
                ''
            )
        ).toBe(true);

        expect(
            document.attachments[document.state.auditReports[0].report]
        ).toStrictEqual(attachment);
    });
});
