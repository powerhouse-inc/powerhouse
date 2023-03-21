import JSZip from 'jszip';
import { BaseAction } from '../actions';
import { Action, Attachment, Document, Reducer } from '../types';
import { getFile, readFile, writeFile } from './node';

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

export async function fetchAttachment(file: string) {
    const { data, mimeType = 'application/octet-stream' } = await getFile(file);
    return { data: data.toString('base64'), mimeType };
}
