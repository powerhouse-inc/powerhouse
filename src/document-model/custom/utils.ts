/**
* This is a scaffold file meant for customization: 
* - modify it by implementing the empty state object
* - delete the file and run the code generator again to have it reset
*/

import { DocumentModelState } from "@acaldas/document-model-graphql/document-model";
import { DocumentModelDocument, ExtendedDocumentModelState, DocumentModelAction } from "../gen";
import { reducer } from '..';
import { 
    FileInput,
    loadFromFile,
    loadFromInput,
    saveToFile,
    saveToFileHandle, 
} from '../../document/utils';

export const createEmptyDocumentModelState = (): DocumentModelState => ({
    "id": "",
    "name": "",
    "extension": "",
    "description": "",
    "author": {
        "name": "",
        "website": ""
    },
    "specifications": [
        {
            "version": 1,
            "changeLog": [],
            "state": {
                "schema": "",
                "initialValue": "",
                "examples": []
            },
            "modules": []
        }
    ]
});

const dateTimeNow = (new Date()).toISOString();
export const createEmptyExtendedDocumentModelState = (): ExtendedDocumentModelState => ({
    name: "",
    created: dateTimeNow,
    lastModified: dateTimeNow,
    documentType: "powerhouse/document-model",
    revision: 0,
    state: createEmptyDocumentModelState(),
    attachments: {},
});

export const loadDocumentModelFromFile = async (path: string) => {
    return loadFromFile<DocumentModelState, DocumentModelAction>(
        path,
        reducer
    );
};

export const loadDocumentModelFromInput = async (
    input: FileInput
): Promise<DocumentModelDocument> => {
    return loadFromInput<DocumentModelState, DocumentModelAction>(
        input,
        reducer
    );
};

export const saveDocumentModelToFile = (
    document: DocumentModelDocument,
    path: string,
    name?: string
): Promise<string> => {
    return saveToFile(document, path, 'phdm', name);
};

export const saveDocumentModelToFileHandle = async (
    document: DocumentModelDocument,
    input: FileSystemFileHandle
) => {
    return saveToFileHandle(document, input);
};