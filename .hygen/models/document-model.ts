import { DocumentModelState } from '@acaldas/document-model-graphql/document-model';

const state: DocumentModelState = {
    id: "powerhouse/document-model", 
    name: "DocumentModel",
    extension: "phdm",
    description: "The Powerhouse Document Model describes the state and operations of a document type.",
    author:{
        name: "Powerhouse",
        website: "https://www.powerhouse.inc/"
    },
    specifications: [
        {
            version: 1,
            changeLog:[],
            modules: [
                {
                    name: "header",
                    operations: [
                        {
                            name: "SetModelName",
                            id: "", description: "", schema: "", template: "", reducer: "", examples: [], errors: []
                        }, {
                            name: "SetModelId",
                            id: "", description: "", schema: "", template: "", reducer: "", examples: [], errors: []
                        }, {
                            name: "SetModelExtension",
                            id: "", description: "", schema: "", template: "", reducer: "", examples: [], errors: []
                        }, {
                            name: "SetModelDescription",
                            id: "", description: "", schema: "", template: "", reducer: "", examples: [], errors: []
                        }, {
                            name: "SetAuthorName",
                            id: "", description: "", schema: "", template: "", reducer: "", examples: [], errors: []
                        }, {
                            name: "SetAuthorWebsite",
                            id: "", description: "", schema: "", template: "", reducer: "", examples: [], errors: []
                        }
                    ],
                    id: "", description: ""
                }, {
                    name: "versioning",
                    operations: [
                        {
                            name: "AddChangeLogItem",
                            id: "", description: "", schema: "", template: "", reducer: "", examples: [], errors: []
                        }, {
                            name: "UpdateChangeLogItem",
                            id: "", description: "", schema: "", template: "", reducer: "", examples: [], errors: []
                        }, {
                            name: "DeleteChangeLogItem",
                            id: "", description: "", schema: "", template: "", reducer: "", examples: [], errors: []
                        }, {
                            name: "ReorderChangeLogItems",
                            id: "", description: "", schema: "", template: "", reducer: "", examples: [], errors: []
                        }, {
                            name: "ReleaseNewVersion",
                            schema: null, // <-- operation does not have any input params
                            id: "", description: "", template: "", reducer: "", examples: [], errors: []
                        }
                    ],
                    id: "", description: ""
                }, {
                    name: "module",
                    operations: [
                        {
                            name: "AddModule",
                            id: "", description: "", schema: "", template: "", reducer: "", examples: [], errors: []
                        }, {
                            name: "SetModuleName",
                            id: "", description: "", schema: "", template: "", reducer: "", examples: [], errors: []
                        }, {
                            name: "SetModuleDescription",
                            id: "", description: "", schema: "", template: "", reducer: "", examples: [], errors: []
                        }, {
                            name: "DeleteModule",
                            id: "", description: "", schema: "", template: "", reducer: "", examples: [], errors: []
                        }, {
                            name: "ReorderModules",
                            id: "", description: "", schema: "", template: "", reducer: "", examples: [], errors: []
                        }
                    ],
                    id: "", description: ""
                }, {
                    name: "operation-error",
                    operations: [
                        {
                            name: "AddOperationError",
                            id: "", description: "", schema: "", template: "", reducer: "", examples: [], errors: []
                        }, {
                            name: "SetOperationErrorCode",
                            id: "", description: "", schema: "", template: "", reducer: "", examples: [], errors: []
                        }, {
                            name: "SetOperationErrorName",
                            id: "", description: "", schema: "", template: "", reducer: "", examples: [], errors: []
                        }, {
                            name: "SetOperationErrorDescription",
                            id: "", description: "", schema: "", template: "", reducer: "", examples: [], errors: []
                        }, {
                            name: "SetOperationErrorTemplate",
                            id: "", description: "", schema: "", template: "", reducer: "", examples: [], errors: []
                        }, {
                            name: "DeleteOperationError",
                            id: "", description: "", schema: "", template: "", reducer: "", examples: [], errors: []
                        }, {
                            name: "ReorderOperationErrors",
                            id: "", description: "", schema: "", template: "", reducer: "", examples: [], errors: []
                        }
                    ],
                    id: "", description: ""
                }, {
                    name: "operation-example",
                    operations: [
                        {
                            name: "AddOperationExample",
                            id: "", description: "", schema: "", template: "", reducer: "", examples: [], errors: []
                        }, {
                            name: "UpdateOperationExample",
                            id: "", description: "", schema: "", template: "", reducer: "", examples: [], errors: []
                        }, {
                            name: "DeleteOperationExample",
                            id: "", description: "", schema: "", template: "", reducer: "", examples: [], errors: []
                        }, {
                            name: "ReorderOperationExamples",
                            id: "", description: "", schema: "", template: "", reducer: "", examples: [], errors: []
                        }
                    ],
                    id: "", description: ""
                }, {
                    name: "operation",
                    operations: [
                        {
                            name: "AddOperation",
                            id: "", description: "", schema: "", template: "", reducer: "", examples: [], errors: []
                        }, {
                            name: "SetOperationName",
                            id: "", description: "", schema: "", template: "", reducer: "", examples: [], errors: []
                        }, {
                            name: "SetOperationSchema",
                            id: "", description: "", schema: "", template: "", reducer: "", examples: [], errors: []
                        }, {
                            name: "SetOperationDescription",
                            id: "", description: "", schema: "", template: "", reducer: "", examples: [], errors: []
                        }, {
                            name: "SetOperationTemplate",
                            id: "", description: "", schema: "", template: "", reducer: "", examples: [], errors: []
                        }, {
                            name: "SetOperationReducer",
                            id: "", description: "", schema: "", template: "", reducer: "", examples: [], errors: []
                        }, {
                            name: "MoveOperation",
                            id: "", description: "", schema: "", template: "", reducer: "", examples: [], errors: []
                        }, {
                            name: "DeleteOperation",
                            id: "", description: "", schema: "", template: "", reducer: "", examples: [], errors: []
                        }, {
                            name: "ReorderModuleOperations",
                            id: "", description: "", schema: "", template: "", reducer: "", examples: [], errors: []
                        }
                    ],
                    id: "", description: ""
                }, {
                    name: "state",
                    operations: [
                        {
                            name: "SetStateSchema",
                            id: "", description: "", schema: "", template: "", reducer: "", examples: [], errors: []
                        }, {
                            name: "SetInitialState",
                            id: "", description: "", schema: "", template: "", reducer: "", examples: [], errors: []
                        }, {
                            name: "AddStateExample",
                            id: "", description: "", schema: "", template: "", reducer: "", examples: [], errors: []
                        }, {
                            name: "UpdateStateExample",
                            id: "", description: "", schema: "", template: "", reducer: "", examples: [], errors: []
                        }, {
                            name: "DeleteStateExample",
                            id: "", description: "", schema: "", template: "", reducer: "", examples: [], errors: []
                        }, {
                            name: "ReorderStateExamples",
                            id: "", description: "", schema: "", template: "", reducer: "", examples: [], errors: []
                        }
                    ],
                    id: "", description: ""
                },
            ],
            state: {
                schema:"", 
                initialValue: JSON.stringify(
                    {
                        id: "",
                        name: "",
                        extension: "",
                        description: "",
                        author: {
                            name: "",
                            website: ""
                        },
                        specifications: [
                            {
                                version: 1,
                                changeLog: [],
                                state: {
                                    schema: "",
                                    initialValue: "",
                                    examples: []
                                },
                                modules: []
                            }
                        ]
                    },
                    undefined,
                    4
                ),
                examples:[]
            }
        }
    ]
};

export default state;