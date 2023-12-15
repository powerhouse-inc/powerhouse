import { DocumentModelState, utils, z } from 'document-model/document-model';
import fs from 'fs';

export async function loadDocumentModel(
    path: string,
): Promise<DocumentModelState> {
    let documentModel: DocumentModelState;
    try {
        if (!path) {
            throw new Error('Document model file not specified');
        } else if (path.endsWith('.zip')) {
            const file = await utils.loadFromFile(path);
            documentModel = file.state.global;
        } else if (path.endsWith('.json')) {
            const data = fs.readFileSync(path, 'utf-8');
            const document = JSON.parse(data);
            // z.DocumentModelStateSchema().parse(document);
            documentModel = document;
        } else {
            throw new Error('File type not supported. Must be zip or json.');
        }
        return documentModel;
    } catch (error) {
        // @ts-ignore
        throw error.code === 'MODULE_NOT_FOUND'
            ? new Error(`Document model not found.`)
            : error;
    }
}
