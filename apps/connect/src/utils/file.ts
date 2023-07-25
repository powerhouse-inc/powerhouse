import type { Document } from '@acaldas/document-model-libs/document';
import path from 'path';

const isBrowser = typeof window !== undefined;

type SaveDocumentFn = (
    document: Document,
    path: string,
    name?: string | undefined
) => Promise<string>;

async function saveDocumentToFileFn(
    document: Document
): Promise<SaveDocumentFn> {
    if (document.documentType === 'powerhouse/budget-statement') {
        const BudgetStatement = await import(
            isBrowser
                ? '@acaldas/document-model-libs/browser/budget-statement'
                : '@acaldas/document-model-libs/budget-statement'
        );
        return BudgetStatement.utils.saveBudgetStatementToFile;
    } else if (document.documentType === 'makerdao/scope-framework') {
        const ScopeFramework = await import(
            isBrowser
                ? '@acaldas/document-model-libs/browser/scope-framework'
                : '@acaldas/document-model-libs/scope-framework'
        );
        return ScopeFramework.saveScopeFrameworkToFile;
    } else {
        throw new Error(`Document "${document.documentType}" is not supported`);
    }
}

export async function saveFile(document: Document, filePath: string) {
    const saveToFile = await saveDocumentToFileFn(document);
    const index = filePath.lastIndexOf(path.sep);
    const dirPath = filePath.slice(0, index);
    const name = filePath.slice(index);
    return saveToFile(document, dirPath, name);
}

type LoadDocumentFn = (path: string) => Promise<Document>;

async function LoadDocumentFromInputFn(
    document: Document
): Promise<LoadDocumentFn> {
    if (document.documentType === 'powerhouse/budget-statement') {
        const BudgetStatement = await import(
            isBrowser
                ? '@acaldas/document-model-libs/browser/budget-statement'
                : '@acaldas/document-model-libs/budget-statement'
        );
        return BudgetStatement.utils.loadBudgetStatementFromInput;
    } else if (document.documentType === 'makerdao/scope-framework') {
        const ScopeFramework = await import(
            isBrowser
                ? '@acaldas/document-model-libs/browser/scope-framework'
                : '@acaldas/document-model-libs/scope-framework'
        );
        return ScopeFramework.loadScopeFrameworkFromInput;
    } else {
        throw new Error(`Document "${document.documentType}" is not supported`);
    }
}

export async function loadFile(path: string) {
    const Document = await import(
        isBrowser
            ? '@acaldas/document-model-libs/browser/document'
            : '@acaldas/document-model-libs/document'
    );
    const baseDocument = await Document.utils.loadFromInput(
        path,
        (state: Document) => state
    );
    const loadFromInput = await LoadDocumentFromInputFn(baseDocument);
    return await loadFromInput(path);
}
