import JSZip from 'jszip';
import { BaseAction } from '../actions/types';
import { Action, Attachment, Document, Reducer } from '../types';
import { fetchFile, getFile, hash, readFile, writeFile } from './node';

/**
 * Saves a document to a ZIP file.
 *
 * @remarks
 * This function creates a ZIP file containing the document's state, operations,
 * and file attachments. The file is saved to the specified path.
 *
 * @param document - The document to save to the file.
 * @param path - The path to save the file to.
 * @param extension - The extension to use for the file.
 * @returns A promise that resolves to the path of the saved file.
 */
export const saveToFile = (
    document: Document,
    path: string,
    extension: string
): Promise<string> => {
    // create zip file
    const zip = new JSZip();
    zip.file('state.json', JSON.stringify(document.initialState, null, 2));
    zip.file('operations.json', JSON.stringify(document.operations, null, 2));

    const attachments = Object.keys(document.fileRegistry) as Attachment[];
    attachments.forEach(key => {
        const file = document.fileRegistry[key];
        const path = key.slice('attachment://'.length);
        zip.file(path, file.data, {
            base64: true,
            createFolders: true,
            comment: file.mimeType,
        });
    });
    const stream = zip.generateNodeStream({
        type: 'nodebuffer',
        streamFiles: true,
    });
    return writeFile(path, `${document.name}.${extension}.zip`, stream);
};

/**
 * Loads a document from a ZIP file.
 *
 * @remarks
 * This function reads a ZIP file and returns the document state after
 * applying all the operations. The reducer is used to apply the operations.
 *
 * @typeParam S - The type of the state object.
 * @typeParam A - The type of the actions that can be applied to the state object.
 *
 * @param path - The path to the ZIP file.
 * @param reducer - The reducer to apply the operations to the state object.
 * @returns A promise that resolves to the document state after applying all the operations.
 * @throws An error if the initial state or the operations history is not found in the ZIP file.
 */
export const loadFromFile = async <S, A extends Action>(
    path: string,
    reducer: Reducer<S, A | BaseAction>
) => {
    const file = readFile(path);
    const zip = new JSZip();
    await zip.loadAsync(file);

    const stateZip = zip.file('state.json');
    if (!stateZip) {
        throw new Error('Initial state not found');
    }
    const state = JSON.parse(await stateZip.async('string')) as Document<
        S,
        A | BaseAction
    >;

    const operationsZip = zip.file('operations.json');
    if (!operationsZip) {
        throw new Error('Operations history not found');
    }
    const operations = JSON.parse(await operationsZip.async('string')) as (
        | A
        | BaseAction
    )[];

    return operations.reduce(
        (state, operation) => reducer(state, operation),
        state
    );
};

/**
 * Fetches an attachment from a URL and returns its base64-encoded data and MIME type.
 * @param url - The URL of the attachment to fetch.
 * @returns A Promise that resolves to an object containing the base64-encoded data and MIME type of the attachment.
 */
export async function fetchAttachment(url: string) {
    const { data, mimeType = 'application/octet-stream' } = await fetchFile(
        url
    );
    return { data: data.toString('base64'), mimeType };
}

/**
 * Reads an attachment from a file and returns its base64-encoded data and MIME type.
 * @param path - The path of the attachment file to read.
 * @returns A Promise that resolves to an object containing the base64-encoded data and MIME type of the attachment.
 */
export async function readAttachment(path: string) {
    const { data, mimeType = 'application/octet-stream' } = await getFile(path);
    return { data: data.toString('base64'), mimeType };
}

/**
 * Returns the md5 hash of the given attachment data.
 * @param data - The base64-encoded data of the attachment to hash.
 * @returns The hash of the attachment data.
 */
export function hashAttachment(data: string) {
    return hash(data);
}
