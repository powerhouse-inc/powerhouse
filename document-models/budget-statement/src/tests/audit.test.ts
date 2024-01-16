/**
 * This is a scaffold file meant for customization:
 * - change it by adding new tests or modifying the existing ones
 */

import { generateMock } from '@powerhousedao/codegen';
import { Operation, utils as baseUtils } from 'document-model/document';
import fs from 'fs';
import JSZip from 'jszip';
import { utils } from '../..';
import { AddAuditReportAction } from '../../gen';
import * as creators from '../../gen/audit/creators';
import { reducer } from '../../gen/reducer';
import { z } from '../../gen/schema';
import { BudgetStatementDocument } from '../../gen/types';

const { createDocument, loadFromFile, saveToFile } = utils;

const { getLocalFile, getRemoteFile } = baseUtils;

describe('Budget Statement Audit Report reducer', () => {
    let document: BudgetStatementDocument;

    beforeEach(() => {
        document = utils.createDocument();
    });

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

    it('should start as empty array', () => {
        expect(document.state.global.auditReports).toStrictEqual([]);
    });

    it('should add audit report', async () => {
        const input = generateMock(z.AddAuditReportInputSchema());
        const file = await getLocalFile(tempFile);
        input.report = file.hash;
        const updatedDocument = reducer(
            document,
            creators.addAuditReport(input, [file]),
        );

        expect(updatedDocument.state.global.auditReports[0]).toStrictEqual(
            input,
        );
        expect(document.state.global.auditReports).toStrictEqual([]);
        expect(updatedDocument.operations.global).toHaveLength(1);
        expect(updatedDocument.operations.global[0].type).toBe(
            'ADD_AUDIT_REPORT',
        );
        expect(updatedDocument.operations.global[0].input).toStrictEqual(input);
        expect(updatedDocument.operations.global[0].index).toEqual(0);
        expect(updatedDocument.attachments[input.report]).toStrictEqual({
            data: file.data,
            mimeType: file.mimeType,
            extension: file.extension,
            fileName: file.fileName,
        });
        expect(document.attachments).toStrictEqual({});
    });

    it('should delete audit report', async () => {
        const initialStateInput = generateMock(z.AddAuditReportInputSchema());
        const input = generateMock(z.DeleteAuditReportInputSchema());
        const file = await getLocalFile(tempFile);
        initialStateInput.report = file.hash;
        input.report = file.hash;
        const document = createDocument({
            state: {
                global: {
                    // @ts-expect-error - Mock
                    auditReports: [initialStateInput],
                },
            },
        });
        const updatedDocument = reducer(
            document,
            creators.deleteAuditReport(input),
        );

        expect(updatedDocument.operations.global).toHaveLength(1);
        expect(updatedDocument.operations.global[0].type).toBe(
            'DELETE_AUDIT_REPORT',
        );
        expect(updatedDocument.operations.global[0].input).toStrictEqual(input);
        expect(updatedDocument.operations.global[0].index).toEqual(0);
        expect(updatedDocument.state.global.auditReports).toStrictEqual([]);
    });

    it('should set default timestamp on audit report', async () => {
        const date = new Date();
        const file = await getLocalFile(tempFile);

        const newDocument = reducer(
            document,
            creators.addAuditReport(
                {
                    report: file.hash,
                    status: 'Approved',
                },

                [file],
            ),
        );
        expect(
            newDocument.state.global.auditReports[0].timestamp >=
                date.toISOString(),
        ).toBe(true);
    });

    it('should add approved audit report', async () => {
        const file = await getLocalFile(tempFile);

        const document = reducer(
            createDocument(),
            creators.addAuditReport(
                {
                    report: file.hash,
                    status: 'Approved',
                    timestamp: '2023-03-15T17:46:22.754Z',
                },

                [file],
            ),
        );
        expect(document.state.global.auditReports[0].status).toBe('Approved');
    });

    it('should add approved with comments audit report', async () => {
        const file = await getLocalFile(tempFile);

        const document = reducer(
            createDocument(),
            creators.addAuditReport(
                {
                    report: file.hash,
                    status: 'ApprovedWithComments',
                    timestamp: '2023-03-15T17:46:22.754Z',
                },

                [file],
            ),
        );
        expect(document.state.global.auditReports[0].status).toBe(
            'ApprovedWithComments',
        );
    });

    it('should add needs action audit report', async () => {
        const file = await getLocalFile(tempFile);

        const document = reducer(
            createDocument(),
            creators.addAuditReport(
                {
                    report: file.hash,
                    status: 'NeedsAction',
                    timestamp: '2023-03-15T17:46:22.754Z',
                },

                [file],
            ),
        );
        expect(document.state.global.auditReports[0].status).toBe(
            'NeedsAction',
        );
    });

    it('should throw if duplicated audit report', async () => {
        const file = await getLocalFile(tempFile);

        const document = reducer(
            createDocument(),
            creators.addAuditReport(
                {
                    report: file.hash,
                    status: 'Approved',
                    timestamp: '2023-03-15T17:46:22.754Z',
                },

                [file],
            ),
        );

        expect(() =>
            reducer(
                document,
                creators.addAuditReport(
                    {
                        report: file.hash,
                        status: 'Approved',
                        timestamp: '2023-03-15T17:46:22.754Z',
                    },

                    [file],
                ),
            ),
        ).toThrow();
    });

    it('should fetch attachment from URL', async () => {
        const file = await getRemoteFile(
            'https://makerdao.com/whitepaper/DaiDec17WP.pdf',
        );

        const document = createDocument();
        const newDocument = reducer(
            document,
            creators.addAuditReport(
                {
                    report: file.hash,
                    status: 'Approved',
                    timestamp: '2023-03-15T17:46:22.754Z',
                },

                [file],
            ),
        );
        expect(newDocument.state.global.auditReports[0]).toStrictEqual({
            report: file.hash,
            status: 'Approved',
            timestamp: '2023-03-15T17:46:22.754Z',
        });
        expect(newDocument.attachments[file.hash].data).toEqual(file.data);
        expect(newDocument.attachments[file.hash].mimeType).toBe(file.mimeType);
        expect(document.state.global.auditReports).toStrictEqual([]);
        expect(document.attachments).toStrictEqual({});
    });

    it('should save attachment to zip', async () => {
        const attachment = await getLocalFile(tempFile);
        const document = reducer(
            createDocument({ name: 'march' }),
            creators.addAuditReport(
                {
                    report: attachment.hash,
                    status: 'NeedsAction',
                    timestamp: '2023-03-15T17:46:22.754Z',
                },

                [attachment],
            ),
        );
        const zipPath = await saveToFile(document, tempDir);
        const file = fs.readFileSync(zipPath);
        const zip = new JSZip();
        await zip.loadAsync(file);

        const report = document.state.global.auditReports[0].report;
        const path = report.slice(''.length);
        const attachmentZip = zip.file(path);

        const { data, ...attributes } = document.attachments[report];
        expect(await attachmentZip?.async('string')).toBe('TEST');
        expect(JSON.parse(attachmentZip?.comment ?? '')).toStrictEqual(
            attributes,
        );
    });

    it('should load attachment from zip', async () => {
        const { hash, ...attachment } = await getLocalFile(tempFile);
        const document = await loadFromFile(`${tempDir}march.phbs.zip`);
        expect(document.state.global.auditReports[0].status).toBe(
            'NeedsAction',
        );
        expect(
            (document.operations.global[0] as Operation<AddAuditReportAction>)
                .input.report,
        ).toBe(hash);

        expect(
            document.attachments[document.state.global.auditReports[0].report],
        ).toStrictEqual(attachment);
    });
});
