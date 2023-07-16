/**
* This is a scaffold file meant for customization: 
* - modify it by implementing the empty state object
* - delete the file and run the code generator again to have it reset
*/

import { ScopeFrameworkState } from "@acaldas/document-model-graphql/scope-framework";
import { hashKey } from '../../document/utils';
import { ExtendedScopeFrameworkState } from "../gen";

const createEmptyScopeFrameworkState = (): ScopeFrameworkState => ({
    rootPath: "A",
    elements: [{
        id: hashKey(),
        name: "Scope Name",
        version: 1,
        type: "Scope",
        path: "A.1",
        components: {
            content: "Scope description goes here."
        }
    }]
});

const dateTimeNow = (new Date()).toISOString();
const createEmptyExtendedScopeFrameworkState = (): ExtendedScopeFrameworkState => ({
    
    // Component 1: document header
    name: "",
    created: dateTimeNow,
    lastModified: dateTimeNow,
    documentType: "makerdao/scope-framework",
    revision: 0,

    // Component 2: (strict) state object
    data: createEmptyScopeFrameworkState(),

    // Component 3: file registry
    fileRegistry: {},

    // TODO: remove operations, lift to the document level structure: operations = { fileRegistry:File[], history:Operation[] }
    operations: [],

    // TODO: remove initialState, lift to the document level (with type: ExtendedDocumentModelState)
    initialState: {
        name: "",
        created: dateTimeNow,
        lastModified: dateTimeNow,
        documentType: "makerdao/scope-framework",
        revision: 0,
        data: createEmptyScopeFrameworkState(),
        fileRegistry: {},
        operations: []
    }
});

export { 
    createEmptyScopeFrameworkState,
    createEmptyExtendedScopeFrameworkState
}