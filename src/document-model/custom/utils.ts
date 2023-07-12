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
    
    // Component 1: document header
    name: "",
    created: dateTimeNow,
    lastModified: dateTimeNow,
    documentType: "powerhouse/document-model",
    revision: 0,

    // Component 2: (strict) state object
    // TODO: rename data to state
    state: createEmptyDocumentModelState(),

    // Component 3: file registry
    fileRegistry: {},

    // TODO: remove operations, lift to the document level structure: operations = { fileRegistry:File[], history:Operation[] }
    operations: [],

    // TODO: remove initialState, lift to the document level (with type: ExtendedDocumentModelState)
    initialState: {
        name: "",
        created: dateTimeNow,
        lastModified: dateTimeNow,
        documentType: "powerhouse/document-model",
        revision: 0,
        state: createEmptyDocumentModelState(),
        fileRegistry: {},
        operations: []
    }
});

export { 
    createEmptyDocumentModelState,
    createEmptyExtendedDocumentModelState
}