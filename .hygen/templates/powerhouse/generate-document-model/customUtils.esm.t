---
to: "./src/<%= h.changeCase.param(documentType) %>/custom/utils.ts"
unless_exists: true
---
/**
* This is a scaffold file meant for customization: 
* - modify it by implementing the empty state object
* - delete the file and run the code generator again to have it reset
*/

import { <%= h.changeCase.pascal(documentType) %>State } from "@acaldas/document-model-graphql/<%= h.changeCase.param(documentType) %>";
import { Extended<%= h.changeCase.pascal(documentType) %>State, <%= h.changeCase.pascal(documentType) %>Action } from "../gen";
import { reducer } from '..';
import { 
    FileInput,
    loadFromFile,
    loadFromInput,
    saveToFile,
    saveToFileHandle, 
} from '../../document/utils';

export const createEmpty<%= h.changeCase.pascal(documentType) %>State = (): <%= h.changeCase.pascal(documentType) %>State => (<%- initialStateValue || '{}'%>);

const dateTimeNow = (new Date()).toISOString();
export const createEmptyExtended<%= h.changeCase.pascal(documentType) %>State = (): Extended<%= h.changeCase.pascal(documentType) %>State => ({
    // Component 1: document header
    name: "",
    created: dateTimeNow,
    lastModified: dateTimeNow,
    documentType: "<%= documentTypeId %>",
    revision: 0,

    // Component 2: (strict) state object
    state: createEmpty<%= h.changeCase.pascal(documentType) %>State(),

    // Component 3: file registry
    fileRegistry: {},

    // TODO: remove operations, lift to the document level structure: operations = { fileRegistry:File[], history:Operation[] }
    operations: [],

    // TODO: remove initialState, lift to the document level (with type: ExtendedDocumentModelState)
    initialState: {
        name: "",
        created: dateTimeNow,
        lastModified: dateTimeNow,
        documentType: "<%= documentTypeId %>",
        revision: 0,
        state: createEmpty<%= h.changeCase.pascal(documentType) %>State(),
        fileRegistry: {},
        operations: []
    }
});

export const load<%= h.changeCase.pascal(documentType) %>FromFile = async (path: string) => {
    return loadFromFile<<%= h.changeCase.pascal(documentType) %>State, <%= h.changeCase.pascal(documentType) %>Action>(
        path,
        reducer
    );
};

export const load<%= h.changeCase.pascal(documentType) %>FromInput = async (
    input: FileInput
): Promise<Extended<%= h.changeCase.pascal(documentType) %>State> => {
    return loadFromInput<<%= h.changeCase.pascal(documentType) %>State, <%= h.changeCase.pascal(documentType) %>Action>(
        input,
        reducer
    );
};

export const save<%= h.changeCase.pascal(documentType) %>ToFile = (
    document: Extended<%= h.changeCase.pascal(documentType) %>State,
    path: string,
    name?: string
): Promise<string> => {
    return saveToFile(document, path, '<%= extension %>', name);
};

export const save<%= h.changeCase.pascal(documentType) %>ToFileHandle = async (
    document: Extended<%= h.changeCase.pascal(documentType) %>State,
    input: FileSystemFileHandle
) => {
    return saveToFileHandle(document, input);
};