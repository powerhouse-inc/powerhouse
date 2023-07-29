import { DocumentModelState } from '@acaldas/document-model-graphql/document-model';

const state: DocumentModelState = {
    id: "makerdao/scope-framework", 
    name: "ScopeFramework",
    extension: "mdsf",
    description: "The MakerDAO Scope Framework document contains articles, sections and other elements that make up the governance rules for the MakerDAO scopes.",
    author:{
        name: "MakerDAO",
        website: "https://www.makerdao.com/"
    },
    specifications: [
        {
            version: 1,
            changeLog: [],
            modules: [
                {
                    name: "main",
                    operations: [
                        {
                            name: "SetRootPath",
                            id: "", description: "", schema: "", template: "", reducer: "", examples: [], errors: []
                        }, {
                            name: "AddElement",
                            id: "", description: "", schema: "", template: "", reducer: "", examples: [], errors: []
                        }, {
                            name: "UpdateElementType",
                            id: "", description: "", schema: "", template: "", reducer: "", examples: [], errors: []
                        }, {
                            name: "UpdateElementName",
                            id: "", description: "", schema: "", template: "", reducer: "", examples: [], errors: []
                        }, {
                            name: "UpdateElementComponents",
                            id: "", description: "", schema: "", template: "", reducer: "", examples: [], errors: []
                        }, {
                            name: "RemoveElement",
                            id: "", description: "", schema: "", template: "", reducer: "", examples: [], errors: []
                        }, {
                            name: "ReorderElements",
                            id: "", description: "", schema: "", template: "", reducer: "", examples: [], errors: []
                        }, {
                            name: "MoveElement",
                            id: "", description: "", schema: "", template: "", reducer: "", examples: [], errors: []
                        }
                    ],
                    id: "", description: ""
                }
            ],
            state: {schema:"", initialValue: "", examples:[]}
        }
    ]
}

export default state;