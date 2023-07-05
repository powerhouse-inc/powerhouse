import { DocumentModelState } from "@acaldas/document-model-graphql/document-model";
import { hashKey } from '../../document/utils';
import { ExtendedDocumentModelState } from "../gen";

const createEmptyDocumentModelState = (): DocumentModelState => ({
    id: hashKey(),
    name: "",
    extension: "",
    description: "",
    author: {
        name: "",
        website: ""
    },
    state: {
        schema: "",
        examples: []
    },
    modules: []
});

const dateTimeNow = (new Date()).toISOString();
const createEmptyExtendedDocumentModelState = (): ExtendedDocumentModelState => ({
    name: "",
    created: dateTimeNow,
    lastModified: dateTimeNow,
    documentType: "powerhouse/document-model",
    revision: 0,
    data: createEmptyDocumentModelState(),
    fileRegistry: {},
    operations: [],
    initialState: {
        name: "",
        created: dateTimeNow,
        lastModified: dateTimeNow,
        documentType: "powerhouse/document-model",
        revision: 0,
        data: createEmptyDocumentModelState(),
        fileRegistry: {},
        operations: []
    }
});

export { 
    createEmptyDocumentModelState,
    createEmptyExtendedDocumentModelState
}