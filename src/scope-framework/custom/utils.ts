/**
* This is a scaffold file meant for customization: 
* - modify it by implementing the empty state object
* - delete the file and run the code generator again to have it reset
*/

import { ScopeFrameworkState } from "@acaldas/document-model-graphql/scope-framework";
import { ScopeFrameworkDocument, ExtendedScopeFrameworkState, ScopeFrameworkAction } from "../gen";
import { reducer } from '..';
import { 
    FileInput,
    loadFromFile,
    loadFromInput,
    saveToFile,
    saveToFileHandle, 
} from '../../document/utils';

export const createEmptyScopeFrameworkState = (): ScopeFrameworkState => ({
    "rootPath": "A",
    "elements": [
        {
            "id": "uGcJFhnNtFSCaVRjaELUqBsMgUI=",
            "name": "Scope Name",
            "version": 1,
            "type": "Scope",
            "path": "A.1",
            "components": {
                "content": "Scope description goes here."
            }
        }
    ]
});

const dateTimeNow = (new Date()).toISOString();
export const createEmptyExtendedScopeFrameworkState = (): ExtendedScopeFrameworkState => ({
    name: "",
    created: dateTimeNow,
    lastModified: dateTimeNow,
    documentType: "makerdao/scope-framework",
    revision: 0,
    state: createEmptyScopeFrameworkState(),
    attachments: {},
});

export const loadScopeFrameworkFromFile = async (path: string) => {
    return loadFromFile<ScopeFrameworkState, ScopeFrameworkAction>(
        path,
        reducer
    );
};

export const loadScopeFrameworkFromInput = async (
    input: FileInput
): Promise<ScopeFrameworkDocument> => {
    return loadFromInput<ScopeFrameworkState, ScopeFrameworkAction>(
        input,
        reducer
    );
};

export const saveScopeFrameworkToFile = (
    document: ScopeFrameworkDocument,
    path: string,
    name?: string
): Promise<string> => {
    return saveToFile(document, path, 'mdsf', name);
};

export const saveScopeFrameworkToFileHandle = async (
    document: ScopeFrameworkDocument,
    input: FileSystemFileHandle
) => {
    return saveToFileHandle(document, input);
};