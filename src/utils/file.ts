import type { Document } from 'document-model/document';
import path from 'path';

type SaveDocumentFn = (
    document: Document<any, any>,
    path: string,
    name?: string | undefined
) => Promise<string>;

type SaveDocumentToFileHandleFn = (
    document: Document<any, any>,
    handle: FileSystemFileHandle
) => Promise<void>;

async function saveDocumentToFileFn(
    document: Document
): Promise<SaveDocumentFn> {
    if (document.documentType === 'powerhouse/budget-statement') {
        const BudgetStatement = await import(
            'document-model-libs/budget-statement'
        );
        return BudgetStatement.utils.saveToFile;
    } else if (document.documentType === 'makerdao/scope-framework') {
        const ScopeFramework = await import(
            'document-model-libs/scope-framework'
        );
        return ScopeFramework.utils.saveToFile;
    } else if (document.documentType === 'powerhouse/document-model') {
        const DocumentModel = await import('document-model/document-model');
        return DocumentModel.utils.saveToFile;
    } else {
        throw new Error(`Document "${document.documentType}" is not supported`);
    }
}

async function saveDocumentToFileHandleFn(
    document: Document
): Promise<SaveDocumentToFileHandleFn> {
    if (document.documentType === 'powerhouse/budget-statement') {
        const BudgetStatement = await import(
            'document-model-libs/budget-statement'
        );
        return BudgetStatement.utils.saveToFileHandle;
    } else if (document.documentType === 'makerdao/scope-framework') {
        const ScopeFramework = await import(
            'document-model-libs/scope-framework'
        );
        return ScopeFramework.utils.saveToFileHandle;
    } else if (document.documentType === 'powerhouse/document-model') {
        const DocumentModel = await import('document-model/document-model');
        return DocumentModel.utils.saveToFileHandle;
    } else {
        throw new Error(`Document "${document.documentType}" is not supported`);
    }
}

export async function saveFile(
    document: Document,
    filePath: string | FileSystemFileHandle
) {
    if (typeof filePath !== 'string') {
        return saveFileHandle(document, filePath);
    }
    const saveToFile = await saveDocumentToFileFn(document);
    const index = filePath.lastIndexOf(path.sep);
    const dirPath = filePath.slice(0, index);
    const name = filePath.slice(index);
    return saveToFile(document, dirPath, name);
}

async function saveFileHandle(
    document: Document,
    fileHandle: FileSystemFileHandle
) {
    const saveToFileHandle = await saveDocumentToFileHandleFn(document);
    return saveToFileHandle(document, fileHandle);
}

type LoadDocumentFn = (path: string | File) => Promise<Document>;

async function LoadDocumentFromInputFn(
    document: Document
): Promise<LoadDocumentFn> {
    if (document.documentType === 'powerhouse/budget-statement') {
        const BudgetStatement = await import(
            'document-model-libs/budget-statement'
        );
        return BudgetStatement.utils.loadFromInput;
    } else if (document.documentType === 'makerdao/scope-framework') {
        const ScopeFramework = await import(
            'document-model-libs/scope-framework'
        );
        return ScopeFramework.utils.loadFromInput;
    } else if (document.documentType === 'powerhouse/document-model') {
        const DocumentModel = await import('document-model/document-model');
        return DocumentModel.utils.loadFromInput;
    } else {
        throw new Error(`Document "${document.documentType}" is not supported`);
    }
}

export async function loadFile(path: string | File) {
    const Document = await import('document-model/document');
    const baseDocument = await Document.utils.loadFromInput(
        path,
        (state: Document) => state
    );
    const loadFromInput = await LoadDocumentFromInputFn(baseDocument);
    return await loadFromInput(path);
}
