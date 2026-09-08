import {
  defineDocumentModel,
  defineDocumentModelFamily,
  ph,
  type EnumDescriptor,
  type InputDescriptor,
  type InterfaceDescriptor,
  type LegacySpecificationCompatibility,
  type ObjectDescriptor,
  type UnionDescriptor,
} from "document-model";

function createDocumentEditorV1() {
const DocumentEditorState: ObjectDescriptor = ph.object("DocumentEditorState", {
description: "Configuration for a document editor contributed by the package. The editor is\nregistered against every document type listed in `documentTypes`; Connect picks\nthe first matching editor when opening a document.",
fields: {
"name": ph.String({ required: true }),
"documentTypes": ph.list(ph.ref(() => DocumentTypeItem, { required: true }), { required: true }),
"status": ph.ref(() => StatusType, { required: true })
},
});

const DocumentTypeItem: ObjectDescriptor = ph.object("DocumentTypeItem", {
description: "A document type id (e.g. 'powerhouse/document-drive') attached to the editor with a stable entry id.",
fields: {
"id": ph.OID({ required: true }),
"documentType": ph.String({ required: true })
},
});

const StatusType: EnumDescriptor = ph.enum("StatusType", {
description: "Lifecycle status of a module definition.\n- DRAFT: still being edited; codegen does not run.\n- CONFIRMED: locked in; codegen produces the corresponding scaffold.",
values: ["DRAFT","CONFIRMED"] as const,
});

const model = defineDocumentModel({
  id: "powerhouse/document-editor",
  name: "Document Editor",
  description: "Declares a document editor (a React UI for editing instances of one or more document models) shipped by a Vetra Reactor Package. Create one Document Editor document per editor, list the document types it can edit, then mark it CONFIRMED to trigger codegen of the editor scaffold under `editors/`. The boilerplate it produces is what you then customize.",
  extension: ".editor",
  version: 1,
  author: {"name":"Powerhouse","website":"https://powerhouse.inc"},
  changeLog: [],
  specifications: {
    auxiliaryTypes: [DocumentTypeItem, StatusType],
    global: {
      schema: DocumentEditorState,
      initialValue: {"name":"","documentTypes":[],"status":"DRAFT"},
      examples: [],
    },
    local: {
      schema: null,
      initialValue: {},
      examples: [],
    },
  },
});

const module0 = model.module("base_operations", {
description: "Set the editor's identity, lifecycle status, and the document types it handles.",
operations: ({ global, local }) => ({
"setEditorName": global({
description: "Set the display name of the editor. Also determines the generated folder name under `editors/`.",
input: ph.input("SetEditorNameInput", { fields: {
"name": ph.String({ required: true })
} }),
template: "",
reducerTemplate: "",
reduceLegacy(_state, _action, _dispatch) {},
}),
"addDocumentType": global({
description: "Register a document type this editor can edit. Caller supplies a stable id so the entry can be removed later.",
input: ph.input("AddDocumentTypeInput", { fields: {
"id": ph.OID({ required: true }),
"documentType": ph.String({ required: true })
} }),
template: "",
reducerTemplate: "",
reduceLegacy(_state, _action, _dispatch) {},
}),
"removeDocumentType": global({
description: "Remove a registered document type entry by its id.",
input: ph.input("RemoveDocumentTypeInput", { fields: {
"id": ph.OID({ required: true })
} }),
template: "",
reducerTemplate: "",
reduceLegacy(_state, _action, _dispatch) {},
}),
"setEditorStatus": global({
description: "Move the editor between DRAFT and CONFIRMED. Codegen only runs once the status is CONFIRMED — leaving it DRAFT means no editor files are produced.",
input: ph.input("SetEditorStatusInput", { fields: {
"status": ph.ref(() => StatusType, { required: true })
} }),
template: "",
reducerTemplate: "",
reduceLegacy(_state, _action, _dispatch) {},
})
}),
});

const compatibility: LegacySpecificationCompatibility = {
  "kind": "explicit-legacy",
  "definition": {
    "version": 1,
    "scalars": [
      {
        "name": "OID",
        "implementation": "powerhouse.catalog#OID",
        "coercionProfile": "document-engineering-1.40"
      }
    ],
    "graphQLCompatibility": {
      "kind": "graphql-ast-v1",
      "document": {
        "kind": "Document",
        "definitions": [
          {
            "kind": "ObjectTypeDefinition",
            "description": {
              "kind": "StringValue",
              "value": "Configuration for a document editor contributed by the package. The editor is\nregistered against every document type listed in `documentTypes`; Connect picks\nthe first matching editor when opening a document.",
              "block": true
            },
            "name": {
              "kind": "Name",
              "value": "DocumentEditorState"
            },
            "interfaces": [],
            "directives": [],
            "fields": [
              {
                "kind": "FieldDefinition",
                "description": {
                  "kind": "StringValue",
                  "value": "Display name of the editor. Also determines the generated folder name under `editors/`.",
                  "block": true
                },
                "name": {
                  "kind": "Name",
                  "value": "name"
                },
                "arguments": [],
                "type": {
                  "kind": "NonNullType",
                  "type": {
                    "kind": "NamedType",
                    "name": {
                      "kind": "Name",
                      "value": "String"
                    }
                  }
                },
                "directives": []
              },
              {
                "kind": "FieldDefinition",
                "description": {
                  "kind": "StringValue",
                  "value": "Document types this editor can edit. Each entry has a stable id so it can be removed individually.",
                  "block": true
                },
                "name": {
                  "kind": "Name",
                  "value": "documentTypes"
                },
                "arguments": [],
                "type": {
                  "kind": "NonNullType",
                  "type": {
                    "kind": "ListType",
                    "type": {
                      "kind": "NonNullType",
                      "type": {
                        "kind": "NamedType",
                        "name": {
                          "kind": "Name",
                          "value": "DocumentTypeItem"
                        }
                      }
                    }
                  }
                },
                "directives": []
              },
              {
                "kind": "FieldDefinition",
                "description": {
                  "kind": "StringValue",
                  "value": "Lifecycle status. While DRAFT the editor definition is editable and codegen is skipped; switching to CONFIRMED triggers scaffold generation.",
                  "block": true
                },
                "name": {
                  "kind": "Name",
                  "value": "status"
                },
                "arguments": [],
                "type": {
                  "kind": "NonNullType",
                  "type": {
                    "kind": "NamedType",
                    "name": {
                      "kind": "Name",
                      "value": "StatusType"
                    }
                  }
                },
                "directives": []
              }
            ]
          },
          {
            "kind": "ObjectTypeDefinition",
            "description": {
              "kind": "StringValue",
              "value": "A document type id (e.g. 'powerhouse/document-drive') attached to the editor with a stable entry id.",
              "block": true
            },
            "name": {
              "kind": "Name",
              "value": "DocumentTypeItem"
            },
            "interfaces": [],
            "directives": [],
            "fields": [
              {
                "kind": "FieldDefinition",
                "description": {
                  "kind": "StringValue",
                  "value": "Stable identifier for the entry; used to remove it.",
                  "block": true
                },
                "name": {
                  "kind": "Name",
                  "value": "id"
                },
                "arguments": [],
                "type": {
                  "kind": "NonNullType",
                  "type": {
                    "kind": "NamedType",
                    "name": {
                      "kind": "Name",
                      "value": "OID"
                    }
                  }
                },
                "directives": []
              },
              {
                "kind": "FieldDefinition",
                "description": {
                  "kind": "StringValue",
                  "value": "Document type id this editor handles (e.g. 'my-org/invoice').",
                  "block": true
                },
                "name": {
                  "kind": "Name",
                  "value": "documentType"
                },
                "arguments": [],
                "type": {
                  "kind": "NonNullType",
                  "type": {
                    "kind": "NamedType",
                    "name": {
                      "kind": "Name",
                      "value": "String"
                    }
                  }
                },
                "directives": []
              }
            ]
          },
          {
            "kind": "EnumTypeDefinition",
            "description": {
              "kind": "StringValue",
              "value": "Lifecycle status of a module definition.\n- DRAFT: still being edited; codegen does not run.\n- CONFIRMED: locked in; codegen produces the corresponding scaffold.",
              "block": true
            },
            "name": {
              "kind": "Name",
              "value": "StatusType"
            },
            "directives": [],
            "values": [
              {
                "kind": "EnumValueDefinition",
                "name": {
                  "kind": "Name",
                  "value": "DRAFT"
                },
                "directives": []
              },
              {
                "kind": "EnumValueDefinition",
                "name": {
                  "kind": "Name",
                  "value": "CONFIRMED"
                },
                "directives": []
              }
            ]
          },
          {
            "kind": "InputObjectTypeDefinition",
            "name": {
              "kind": "Name",
              "value": "SetEditorNameInput"
            },
            "directives": [],
            "fields": [
              {
                "kind": "InputValueDefinition",
                "name": {
                  "kind": "Name",
                  "value": "name"
                },
                "type": {
                  "kind": "NonNullType",
                  "type": {
                    "kind": "NamedType",
                    "name": {
                      "kind": "Name",
                      "value": "String"
                    }
                  }
                },
                "directives": []
              }
            ]
          },
          {
            "kind": "InputObjectTypeDefinition",
            "name": {
              "kind": "Name",
              "value": "AddDocumentTypeInput"
            },
            "directives": [],
            "fields": [
              {
                "kind": "InputValueDefinition",
                "name": {
                  "kind": "Name",
                  "value": "id"
                },
                "type": {
                  "kind": "NonNullType",
                  "type": {
                    "kind": "NamedType",
                    "name": {
                      "kind": "Name",
                      "value": "OID"
                    }
                  }
                },
                "directives": []
              },
              {
                "kind": "InputValueDefinition",
                "name": {
                  "kind": "Name",
                  "value": "documentType"
                },
                "type": {
                  "kind": "NonNullType",
                  "type": {
                    "kind": "NamedType",
                    "name": {
                      "kind": "Name",
                      "value": "String"
                    }
                  }
                },
                "directives": []
              }
            ]
          },
          {
            "kind": "InputObjectTypeDefinition",
            "name": {
              "kind": "Name",
              "value": "RemoveDocumentTypeInput"
            },
            "directives": [],
            "fields": [
              {
                "kind": "InputValueDefinition",
                "name": {
                  "kind": "Name",
                  "value": "id"
                },
                "type": {
                  "kind": "NonNullType",
                  "type": {
                    "kind": "NamedType",
                    "name": {
                      "kind": "Name",
                      "value": "OID"
                    }
                  }
                },
                "directives": []
              }
            ]
          },
          {
            "kind": "InputObjectTypeDefinition",
            "name": {
              "kind": "Name",
              "value": "SetEditorStatusInput"
            },
            "directives": [],
            "fields": [
              {
                "kind": "InputValueDefinition",
                "name": {
                  "kind": "Name",
                  "value": "status"
                },
                "type": {
                  "kind": "NonNullType",
                  "type": {
                    "kind": "NamedType",
                    "name": {
                      "kind": "Name",
                      "value": "StatusType"
                    }
                  }
                },
                "directives": []
              }
            ]
          }
        ]
      },
      "preserveDefinitionOrder": true
    },
    "types": [
      {
        "kind": "object",
        "name": "DocumentEditorState",
        "description": "Configuration for a document editor contributed by the package. The editor is\nregistered against every document type listed in `documentTypes`; Connect picks\nthe first matching editor when opening a document.",
        "fields": [
          {
            "key": "name",
            "name": "name",
            "description": "Display name of the editor. Also determines the generated folder name under `editors/`.",
            "deprecated": null,
            "type": {
              "kind": "scalar",
              "name": "String",
              "required": true
            }
          },
          {
            "key": "documentTypes",
            "name": "documentTypes",
            "description": "Document types this editor can edit. Each entry has a stable id so it can be removed individually.",
            "deprecated": null,
            "type": {
              "kind": "list",
              "required": true,
              "item": {
                "kind": "named",
                "name": "DocumentTypeItem",
                "required": true
              }
            }
          },
          {
            "key": "status",
            "name": "status",
            "description": "Lifecycle status. While DRAFT the editor definition is editable and codegen is skipped; switching to CONFIRMED triggers scaffold generation.",
            "deprecated": null,
            "type": {
              "kind": "named",
              "name": "StatusType",
              "required": true
            }
          }
        ]
      },
      {
        "kind": "object",
        "name": "DocumentTypeItem",
        "description": "A document type id (e.g. 'powerhouse/document-drive') attached to the editor with a stable entry id.",
        "fields": [
          {
            "key": "id",
            "name": "id",
            "description": "Stable identifier for the entry; used to remove it.",
            "deprecated": null,
            "type": {
              "kind": "scalar",
              "name": "OID",
              "required": true
            }
          },
          {
            "key": "documentType",
            "name": "documentType",
            "description": "Document type id this editor handles (e.g. 'my-org/invoice').",
            "deprecated": null,
            "type": {
              "kind": "scalar",
              "name": "String",
              "required": true
            }
          }
        ]
      },
      {
        "kind": "enum",
        "name": "StatusType",
        "description": "Lifecycle status of a module definition.\n- DRAFT: still being edited; codegen does not run.\n- CONFIRMED: locked in; codegen produces the corresponding scaffold.",
        "values": [
          {
            "name": "DRAFT",
            "description": null,
            "deprecated": null
          },
          {
            "name": "CONFIRMED",
            "description": null,
            "deprecated": null
          }
        ]
      }
    ],
    "state": {
      "global": {
        "root": {
          "kind": "named",
          "name": "DocumentEditorState",
          "required": true
        },
        "initialValue": {
          "name": "",
          "documentTypes": [],
          "status": "DRAFT"
        },
        "examples": [],
        "unknownKeys": "preserve",
        "materialized": {
          "schema": "\"\"\"\nConfiguration for a document editor contributed by the package. The editor is\nregistered against every document type listed in `documentTypes`; Connect picks\nthe first matching editor when opening a document.\n\"\"\"\ntype DocumentEditorState {\n  \"\"\"Display name of the editor. Also determines the generated folder name under `editors/`.\"\"\"\n  name: String!\n  \"\"\"Document types this editor can edit. Each entry has a stable id so it can be removed individually.\"\"\"\n  documentTypes: [DocumentTypeItem!]!\n  \"\"\"Lifecycle status. While DRAFT the editor definition is editable and codegen is skipped; switching to CONFIRMED triggers scaffold generation.\"\"\"\n  status: StatusType!\n}\n\n\"\"\"A document type id (e.g. 'powerhouse/document-drive') attached to the editor with a stable entry id.\"\"\"\ntype DocumentTypeItem {\n  \"\"\"Stable identifier for the entry; used to remove it.\"\"\"\n  id: OID!\n  \"\"\"Document type id this editor handles (e.g. 'my-org/invoice').\"\"\"\n  documentType: String!\n}\n\n\"\"\"\nLifecycle status of a module definition.\n- DRAFT: still being edited; codegen does not run.\n- CONFIRMED: locked in; codegen produces the corresponding scaffold.\n\"\"\"\nenum StatusType {\n  DRAFT\n  CONFIRMED\n}",
          "initialValue": "{\n  \"name\": \"\",\n  \"documentTypes\": [],\n  \"status\": \"DRAFT\"\n}",
          "examples": []
        }
      },
      "local": {
        "root": null,
        "initialValue": {},
        "examples": [],
        "unknownKeys": "preserve",
        "materialized": {
          "schema": "",
          "initialValue": "",
          "examples": []
        }
      }
    },
    "modules": [
      {
        "id": "73f6d103-47cb-4074-a736-a3eaf5d079bf",
        "key": "base_operations",
        "name": "base_operations",
        "description": "Set the editor's identity, lifecycle status, and the document types it handles.",
        "operations": [
          {
            "id": "50a16f00-d25a-4c97-9632-4ce3b951a402",
            "key": "SET_EDITOR_NAME",
            "name": "SET_EDITOR_NAME",
            "description": "Set the display name of the editor. Also determines the generated folder name under `editors/`.",
            "actionType": "SET_EDITOR_NAME",
            "creatorKey": "setEditorName",
            "scope": "global",
            "input": {
              "kind": "input",
              "name": "SetEditorNameInput",
              "description": null,
              "unknownKeys": "preserve",
              "fields": [
                {
                  "key": "name",
                  "name": "name",
                  "description": null,
                  "deprecated": null,
                  "type": {
                    "kind": "scalar",
                    "name": "String",
                    "required": true
                  }
                }
              ]
            },
            "errors": [],
            "examples": [],
            "template": "",
            "reducer": ""
          },
          {
            "id": "acee4272-f29e-4a19-aaf9-bae2cb6652ab",
            "key": "ADD_DOCUMENT_TYPE",
            "name": "ADD_DOCUMENT_TYPE",
            "description": "Register a document type this editor can edit. Caller supplies a stable id so the entry can be removed later.",
            "actionType": "ADD_DOCUMENT_TYPE",
            "creatorKey": "addDocumentType",
            "scope": "global",
            "input": {
              "kind": "input",
              "name": "AddDocumentTypeInput",
              "description": null,
              "unknownKeys": "preserve",
              "fields": [
                {
                  "key": "id",
                  "name": "id",
                  "description": null,
                  "deprecated": null,
                  "type": {
                    "kind": "scalar",
                    "name": "OID",
                    "required": true
                  }
                },
                {
                  "key": "documentType",
                  "name": "documentType",
                  "description": null,
                  "deprecated": null,
                  "type": {
                    "kind": "scalar",
                    "name": "String",
                    "required": true
                  }
                }
              ]
            },
            "errors": [],
            "examples": [],
            "template": "",
            "reducer": ""
          },
          {
            "id": "6c549776-0fc3-4632-a6c7-8721fa6ee41c",
            "key": "REMOVE_DOCUMENT_TYPE",
            "name": "REMOVE_DOCUMENT_TYPE",
            "description": "Remove a registered document type entry by its id.",
            "actionType": "REMOVE_DOCUMENT_TYPE",
            "creatorKey": "removeDocumentType",
            "scope": "global",
            "input": {
              "kind": "input",
              "name": "RemoveDocumentTypeInput",
              "description": null,
              "unknownKeys": "preserve",
              "fields": [
                {
                  "key": "id",
                  "name": "id",
                  "description": null,
                  "deprecated": null,
                  "type": {
                    "kind": "scalar",
                    "name": "OID",
                    "required": true
                  }
                }
              ]
            },
            "errors": [],
            "examples": [],
            "template": "",
            "reducer": ""
          },
          {
            "id": "e9aa7f08-553b-452f-a494-126ace6b15f7",
            "key": "SET_EDITOR_STATUS",
            "name": "SET_EDITOR_STATUS",
            "description": "Move the editor between DRAFT and CONFIRMED. Codegen only runs once the status is CONFIRMED — leaving it DRAFT means no editor files are produced.",
            "actionType": "SET_EDITOR_STATUS",
            "creatorKey": "setEditorStatus",
            "scope": "global",
            "input": {
              "kind": "input",
              "name": "SetEditorStatusInput",
              "description": null,
              "unknownKeys": "preserve",
              "fields": [
                {
                  "key": "status",
                  "name": "status",
                  "description": null,
                  "deprecated": null,
                  "type": {
                    "kind": "named",
                    "name": "StatusType",
                    "required": true
                  }
                }
              ]
            },
            "errors": [],
            "examples": [],
            "template": "",
            "reducer": ""
          }
        ]
      }
    ],
    "changeLog": []
  },
  "materialized": {
    "state": {
      "local": {
        "schema": "",
        "examples": [],
        "initialValue": ""
      },
      "global": {
        "schema": "\"\"\"\nConfiguration for a document editor contributed by the package. The editor is\nregistered against every document type listed in `documentTypes`; Connect picks\nthe first matching editor when opening a document.\n\"\"\"\ntype DocumentEditorState {\n  \"\"\"Display name of the editor. Also determines the generated folder name under `editors/`.\"\"\"\n  name: String!\n  \"\"\"Document types this editor can edit. Each entry has a stable id so it can be removed individually.\"\"\"\n  documentTypes: [DocumentTypeItem!]!\n  \"\"\"Lifecycle status. While DRAFT the editor definition is editable and codegen is skipped; switching to CONFIRMED triggers scaffold generation.\"\"\"\n  status: StatusType!\n}\n\n\"\"\"A document type id (e.g. 'powerhouse/document-drive') attached to the editor with a stable entry id.\"\"\"\ntype DocumentTypeItem {\n  \"\"\"Stable identifier for the entry; used to remove it.\"\"\"\n  id: OID!\n  \"\"\"Document type id this editor handles (e.g. 'my-org/invoice').\"\"\"\n  documentType: String!\n}\n\n\"\"\"\nLifecycle status of a module definition.\n- DRAFT: still being edited; codegen does not run.\n- CONFIRMED: locked in; codegen produces the corresponding scaffold.\n\"\"\"\nenum StatusType {\n  DRAFT\n  CONFIRMED\n}",
        "examples": [],
        "initialValue": "{\n  \"name\": \"\",\n  \"documentTypes\": [],\n  \"status\": \"DRAFT\"\n}"
      }
    },
    "modules": [
      {
        "id": "73f6d103-47cb-4074-a736-a3eaf5d079bf",
        "name": "base_operations",
        "description": "Set the editor's identity, lifecycle status, and the document types it handles.",
        "operations": [
          {
            "id": "50a16f00-d25a-4c97-9632-4ce3b951a402",
            "name": "SET_EDITOR_NAME",
            "description": "Set the display name of the editor. Also determines the generated folder name under `editors/`.",
            "schema": "input SetEditorNameInput {\n  name: String!\n}",
            "template": "",
            "reducer": "",
            "errors": [],
            "examples": [],
            "scope": "global"
          },
          {
            "id": "acee4272-f29e-4a19-aaf9-bae2cb6652ab",
            "name": "ADD_DOCUMENT_TYPE",
            "description": "Register a document type this editor can edit. Caller supplies a stable id so the entry can be removed later.",
            "schema": "input AddDocumentTypeInput {\n  id: OID!\n  documentType: String!\n}",
            "template": "",
            "reducer": "",
            "errors": [],
            "examples": [],
            "scope": "global"
          },
          {
            "id": "6c549776-0fc3-4632-a6c7-8721fa6ee41c",
            "name": "REMOVE_DOCUMENT_TYPE",
            "description": "Remove a registered document type entry by its id.",
            "schema": "input RemoveDocumentTypeInput {\n  id: OID!\n}",
            "template": "",
            "reducer": "",
            "errors": [],
            "examples": [],
            "scope": "global"
          },
          {
            "id": "e9aa7f08-553b-452f-a494-126ace6b15f7",
            "name": "SET_EDITOR_STATUS",
            "description": "Move the editor between DRAFT and CONFIRMED. Codegen only runs once the status is CONFIRMED — leaving it DRAFT means no editor files are produced.",
            "schema": "input SetEditorStatusInput {\n  status: StatusType!\n}",
            "template": "",
            "reducer": "",
            "errors": [],
            "examples": [],
            "scope": "global"
          }
        ]
      }
    ],
    "version": 1,
    "changeLog": []
  }
};
return model.version({
  modules: [module0],
  compatibility,
});
}

const DocumentEditorFamily = defineDocumentModelFamily({
  versions: [createDocumentEditorV1()],
  upgrades: [],
});

export const DocumentEditorV1 = DocumentEditorFamily.at(1);
export const documentModels = DocumentEditorFamily.modules;
export const upgradeManifests = [DocumentEditorFamily.upgradeManifest];
