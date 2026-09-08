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

function createAppModuleV1() {
const AppModuleState: ObjectDescriptor = ph.object("AppModuleState", {
description: "Configuration for a Drive App contributed by the package. Drive apps render a\ncustom view at the drive level (instead of, or alongside, the document file\ntree) and can opt into which document types they accept.",
fields: {
"name": ph.String({ required: true }),
"status": ph.ref(() => StatusType, { required: true }),
"allowedDocumentTypes": ph.list(ph.String({ required: true })),
"isDragAndDropEnabled": ph.Boolean({ required: true })
},
});

const StatusType: EnumDescriptor = ph.enum("StatusType", {
description: "Lifecycle status of a module definition.\n- DRAFT: still being edited; codegen does not run.\n- CONFIRMED: locked in; codegen produces the corresponding scaffold.",
values: ["DRAFT","CONFIRMED"] as const,
});

const model = defineDocumentModel({
  id: "powerhouse/app",
  name: "App Module",
  description: "Declares a custom Drive App (a drive-level UI surface) shipped by a Vetra Reactor Package. Use one App Module document per drive app: configure which document types it handles, whether it accepts drag-and-drop, and mark it CONFIRMED to trigger codegen of the corresponding app scaffold under `apps/`.",
  extension: ".app",
  version: 1,
  author: {"name":"Powerhouse","website":"https://powerhouse.inc"},
  changeLog: [],
  specifications: {
    auxiliaryTypes: [StatusType],
    global: {
      schema: AppModuleState,
      initialValue: {"name":"","status":"DRAFT","allowedDocumentTypes":null,"isDragAndDropEnabled":true},
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
description: "Set the app's identity, lifecycle status, and the document types it handles.",
operations: ({ global, local }) => ({
"setAppName": global({
description: "Set the display name of the drive app. Also determines the generated folder name under `apps/`.",
input: ph.input("SetAppNameInput", { fields: {
"name": ph.String({ required: true })
} }),
template: "",
reducerTemplate: "",
reduceLegacy(_state, _action, _dispatch) {},
}),
"setAppStatus": global({
description: "Move the app between DRAFT and CONFIRMED. Codegen only runs once the status is CONFIRMED.",
input: ph.input("SetAppStatusInput", { fields: {
"status": ph.ref(() => StatusType, { required: true })
} }),
template: "",
reducerTemplate: "",
reduceLegacy(_state, _action, _dispatch) {},
}),
"addDocumentType": global({
description: "Append a document type id to the list of types this app handles. Initializes the list if it was `null` (accept-any).",
input: ph.input("AddDocumentTypeInput", { fields: {
"documentType": ph.String({ required: true })
} }),
template: "",
reducerTemplate: "",
reduceLegacy(_state, _action, _dispatch) {},
}),
"removeDocumentType": global({
description: "Remove a document type id from the handled list. No-op if the type is not present.",
input: ph.input("RemoveDocumentTypeInput", { fields: {
"documentType": ph.String({ required: true })
} }),
template: "",
reducerTemplate: "",
reduceLegacy(_state, _action, _dispatch) {},
}),
"setDocumentTypes": global({
description: "Replace the entire allowed-document-types list in one call. Pass an empty list to accept none.",
input: ph.input("SetDocumentTypesInput", { fields: {
"documentTypes": ph.list(ph.String({ required: true }), { required: true })
} }),
template: "",
reducerTemplate: "",
reduceLegacy(_state, _action, _dispatch) {},
})
}),
});

const module1 = model.module("dnd_operations", {
description: "Toggle drag-and-drop file handling for the app surface.",
operations: ({ global, local }) => ({
"setDragAndDropEnabled": global({
description: "Enable or disable drag-and-drop file handling on the app surface.",
input: ph.input("SetDragAndDropEnabledInput", { fields: {
"enabled": ph.Boolean({ required: true })
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
    "scalars": [],
    "graphQLCompatibility": {
      "kind": "graphql-ast-v1",
      "document": {
        "kind": "Document",
        "definitions": [
          {
            "kind": "ObjectTypeDefinition",
            "description": {
              "kind": "StringValue",
              "value": "Configuration for a Drive App contributed by the package. Drive apps render a\ncustom view at the drive level (instead of, or alongside, the document file\ntree) and can opt into which document types they accept.",
              "block": true
            },
            "name": {
              "kind": "Name",
              "value": "AppModuleState"
            },
            "interfaces": [],
            "directives": [],
            "fields": [
              {
                "kind": "FieldDefinition",
                "description": {
                  "kind": "StringValue",
                  "value": "Display name of the drive app. Also used as the source for the generated folder name under `apps/`.",
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
                  "value": "Lifecycle status. While DRAFT the app definition is editable and codegen is skipped; switching to CONFIRMED triggers app scaffold generation.",
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
              },
              {
                "kind": "FieldDefinition",
                "description": {
                  "kind": "StringValue",
                  "value": "Document type ids this app handles. `null` means the app accepts any document type; an empty list means it accepts none.",
                  "block": true
                },
                "name": {
                  "kind": "Name",
                  "value": "allowedDocumentTypes"
                },
                "arguments": [],
                "type": {
                  "kind": "ListType",
                  "type": {
                    "kind": "NonNullType",
                    "type": {
                      "kind": "NamedType",
                      "name": {
                        "kind": "Name",
                        "value": "String"
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
                  "value": "Whether the app surface accepts dropped files from the user. Defaults to true.",
                  "block": true
                },
                "name": {
                  "kind": "Name",
                  "value": "isDragAndDropEnabled"
                },
                "arguments": [],
                "type": {
                  "kind": "NonNullType",
                  "type": {
                    "kind": "NamedType",
                    "name": {
                      "kind": "Name",
                      "value": "Boolean"
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
              "value": "SetAppNameInput"
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
              "value": "SetAppStatusInput"
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
              "value": "SetDocumentTypesInput"
            },
            "directives": [],
            "fields": [
              {
                "kind": "InputValueDefinition",
                "name": {
                  "kind": "Name",
                  "value": "documentTypes"
                },
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
                          "value": "String"
                        }
                      }
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
              "value": "SetDragAndDropEnabledInput"
            },
            "directives": [],
            "fields": [
              {
                "kind": "InputValueDefinition",
                "name": {
                  "kind": "Name",
                  "value": "enabled"
                },
                "type": {
                  "kind": "NonNullType",
                  "type": {
                    "kind": "NamedType",
                    "name": {
                      "kind": "Name",
                      "value": "Boolean"
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
        "name": "AppModuleState",
        "description": "Configuration for a Drive App contributed by the package. Drive apps render a\ncustom view at the drive level (instead of, or alongside, the document file\ntree) and can opt into which document types they accept.",
        "fields": [
          {
            "key": "name",
            "name": "name",
            "description": "Display name of the drive app. Also used as the source for the generated folder name under `apps/`.",
            "deprecated": null,
            "type": {
              "kind": "scalar",
              "name": "String",
              "required": true
            }
          },
          {
            "key": "status",
            "name": "status",
            "description": "Lifecycle status. While DRAFT the app definition is editable and codegen is skipped; switching to CONFIRMED triggers app scaffold generation.",
            "deprecated": null,
            "type": {
              "kind": "named",
              "name": "StatusType",
              "required": true
            }
          },
          {
            "key": "allowedDocumentTypes",
            "name": "allowedDocumentTypes",
            "description": "Document type ids this app handles. `null` means the app accepts any document type; an empty list means it accepts none.",
            "deprecated": null,
            "type": {
              "kind": "list",
              "required": false,
              "item": {
                "kind": "scalar",
                "name": "String",
                "required": true
              }
            }
          },
          {
            "key": "isDragAndDropEnabled",
            "name": "isDragAndDropEnabled",
            "description": "Whether the app surface accepts dropped files from the user. Defaults to true.",
            "deprecated": null,
            "type": {
              "kind": "scalar",
              "name": "Boolean",
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
          "name": "AppModuleState",
          "required": true
        },
        "initialValue": {
          "name": "",
          "status": "DRAFT",
          "allowedDocumentTypes": null,
          "isDragAndDropEnabled": true
        },
        "examples": [],
        "unknownKeys": "preserve",
        "materialized": {
          "schema": "\"\"\"\nConfiguration for a Drive App contributed by the package. Drive apps render a\ncustom view at the drive level (instead of, or alongside, the document file\ntree) and can opt into which document types they accept.\n\"\"\"\ntype AppModuleState {\n  \"\"\"Display name of the drive app. Also used as the source for the generated folder name under `apps/`.\"\"\"\n  name: String!\n  \"\"\"Lifecycle status. While DRAFT the app definition is editable and codegen is skipped; switching to CONFIRMED triggers app scaffold generation.\"\"\"\n  status: StatusType!\n  \"\"\"Document type ids this app handles. `null` means the app accepts any document type; an empty list means it accepts none.\"\"\"\n  allowedDocumentTypes: [String!]\n  \"\"\"Whether the app surface accepts dropped files from the user. Defaults to true.\"\"\"\n  isDragAndDropEnabled: Boolean!\n}\n\n\"\"\"\nLifecycle status of a module definition.\n- DRAFT: still being edited; codegen does not run.\n- CONFIRMED: locked in; codegen produces the corresponding scaffold.\n\"\"\"\nenum StatusType {\n  DRAFT\n  CONFIRMED\n}",
          "initialValue": "{\n  \"name\": \"\",\n  \"status\": \"DRAFT\",\n  \"allowedDocumentTypes\": null,\n  \"isDragAndDropEnabled\": true\n}",
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
        "id": "d274599a-ceb5-4f2b-8651-b25787306734",
        "key": "base_operations",
        "name": "base_operations",
        "description": "Set the app's identity, lifecycle status, and the document types it handles.",
        "operations": [
          {
            "id": "f2ba2ddc-8527-4162-93bd-e045e9932013",
            "key": "SET_APP_NAME",
            "name": "SET_APP_NAME",
            "description": "Set the display name of the drive app. Also determines the generated folder name under `apps/`.",
            "actionType": "SET_APP_NAME",
            "creatorKey": "setAppName",
            "scope": "global",
            "input": {
              "kind": "input",
              "name": "SetAppNameInput",
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
            "id": "c842efa4-154c-4fd9-9d12-42bec51af4e9",
            "key": "SET_APP_STATUS",
            "name": "SET_APP_STATUS",
            "description": "Move the app between DRAFT and CONFIRMED. Codegen only runs once the status is CONFIRMED.",
            "actionType": "SET_APP_STATUS",
            "creatorKey": "setAppStatus",
            "scope": "global",
            "input": {
              "kind": "input",
              "name": "SetAppStatusInput",
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
          },
          {
            "id": "7376f168-695f-4aef-94d0-6e381666358c",
            "key": "ADD_DOCUMENT_TYPE",
            "name": "ADD_DOCUMENT_TYPE",
            "description": "Append a document type id to the list of types this app handles. Initializes the list if it was `null` (accept-any).",
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
            "id": "310e4e5b-3f14-4e9a-8e09-5583c7698a65",
            "key": "REMOVE_DOCUMENT_TYPE",
            "name": "REMOVE_DOCUMENT_TYPE",
            "description": "Remove a document type id from the handled list. No-op if the type is not present.",
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
            "id": "b365727a-7df3-48f0-a4f8-02362f02ad1d",
            "key": "SET_DOCUMENT_TYPES",
            "name": "SET_DOCUMENT_TYPES",
            "description": "Replace the entire allowed-document-types list in one call. Pass an empty list to accept none.",
            "actionType": "SET_DOCUMENT_TYPES",
            "creatorKey": "setDocumentTypes",
            "scope": "global",
            "input": {
              "kind": "input",
              "name": "SetDocumentTypesInput",
              "description": null,
              "unknownKeys": "preserve",
              "fields": [
                {
                  "key": "documentTypes",
                  "name": "documentTypes",
                  "description": null,
                  "deprecated": null,
                  "type": {
                    "kind": "list",
                    "required": true,
                    "item": {
                      "kind": "scalar",
                      "name": "String",
                      "required": true
                    }
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
      },
      {
        "id": "270faa10-92e9-40d0-b128-2de32704bcb5",
        "key": "dnd_operations",
        "name": "dnd_operations",
        "description": "Toggle drag-and-drop file handling for the app surface.",
        "operations": [
          {
            "id": "077b1ab8-cb32-4b4e-a1fa-76178188c6a1",
            "key": "SET_DRAG_AND_DROP_ENABLED",
            "name": "SET_DRAG_AND_DROP_ENABLED",
            "description": "Enable or disable drag-and-drop file handling on the app surface.",
            "actionType": "SET_DRAG_AND_DROP_ENABLED",
            "creatorKey": "setDragAndDropEnabled",
            "scope": "global",
            "input": {
              "kind": "input",
              "name": "SetDragAndDropEnabledInput",
              "description": null,
              "unknownKeys": "preserve",
              "fields": [
                {
                  "key": "enabled",
                  "name": "enabled",
                  "description": null,
                  "deprecated": null,
                  "type": {
                    "kind": "scalar",
                    "name": "Boolean",
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
        "schema": "\"\"\"\nConfiguration for a Drive App contributed by the package. Drive apps render a\ncustom view at the drive level (instead of, or alongside, the document file\ntree) and can opt into which document types they accept.\n\"\"\"\ntype AppModuleState {\n  \"\"\"Display name of the drive app. Also used as the source for the generated folder name under `apps/`.\"\"\"\n  name: String!\n  \"\"\"Lifecycle status. While DRAFT the app definition is editable and codegen is skipped; switching to CONFIRMED triggers app scaffold generation.\"\"\"\n  status: StatusType!\n  \"\"\"Document type ids this app handles. `null` means the app accepts any document type; an empty list means it accepts none.\"\"\"\n  allowedDocumentTypes: [String!]\n  \"\"\"Whether the app surface accepts dropped files from the user. Defaults to true.\"\"\"\n  isDragAndDropEnabled: Boolean!\n}\n\n\"\"\"\nLifecycle status of a module definition.\n- DRAFT: still being edited; codegen does not run.\n- CONFIRMED: locked in; codegen produces the corresponding scaffold.\n\"\"\"\nenum StatusType {\n  DRAFT\n  CONFIRMED\n}",
        "examples": [],
        "initialValue": "{\n  \"name\": \"\",\n  \"status\": \"DRAFT\",\n  \"allowedDocumentTypes\": null,\n  \"isDragAndDropEnabled\": true\n}"
      }
    },
    "modules": [
      {
        "id": "d274599a-ceb5-4f2b-8651-b25787306734",
        "name": "base_operations",
        "description": "Set the app's identity, lifecycle status, and the document types it handles.",
        "operations": [
          {
            "id": "f2ba2ddc-8527-4162-93bd-e045e9932013",
            "name": "SET_APP_NAME",
            "description": "Set the display name of the drive app. Also determines the generated folder name under `apps/`.",
            "schema": "input SetAppNameInput {\n  name: String!\n}",
            "template": "",
            "reducer": "",
            "errors": [],
            "examples": [],
            "scope": "global"
          },
          {
            "id": "c842efa4-154c-4fd9-9d12-42bec51af4e9",
            "name": "SET_APP_STATUS",
            "description": "Move the app between DRAFT and CONFIRMED. Codegen only runs once the status is CONFIRMED.",
            "schema": "input SetAppStatusInput {\n  status: StatusType!\n}",
            "template": "",
            "reducer": "",
            "errors": [],
            "examples": [],
            "scope": "global"
          },
          {
            "id": "7376f168-695f-4aef-94d0-6e381666358c",
            "name": "ADD_DOCUMENT_TYPE",
            "description": "Append a document type id to the list of types this app handles. Initializes the list if it was `null` (accept-any).",
            "schema": "input AddDocumentTypeInput {\n  documentType: String!\n}",
            "template": "",
            "reducer": "",
            "errors": [],
            "examples": [],
            "scope": "global"
          },
          {
            "id": "310e4e5b-3f14-4e9a-8e09-5583c7698a65",
            "name": "REMOVE_DOCUMENT_TYPE",
            "description": "Remove a document type id from the handled list. No-op if the type is not present.",
            "schema": "input RemoveDocumentTypeInput {\n  documentType: String!\n}",
            "template": "",
            "reducer": "",
            "errors": [],
            "examples": [],
            "scope": "global"
          },
          {
            "id": "b365727a-7df3-48f0-a4f8-02362f02ad1d",
            "name": "SET_DOCUMENT_TYPES",
            "description": "Replace the entire allowed-document-types list in one call. Pass an empty list to accept none.",
            "schema": "input SetDocumentTypesInput {\n  documentTypes: [String!]!\n}",
            "template": "",
            "reducer": "",
            "errors": [],
            "examples": [],
            "scope": "global"
          }
        ]
      },
      {
        "id": "270faa10-92e9-40d0-b128-2de32704bcb5",
        "name": "dnd_operations",
        "description": "Toggle drag-and-drop file handling for the app surface.",
        "operations": [
          {
            "id": "077b1ab8-cb32-4b4e-a1fa-76178188c6a1",
            "name": "SET_DRAG_AND_DROP_ENABLED",
            "description": "Enable or disable drag-and-drop file handling on the app surface.",
            "schema": "input SetDragAndDropEnabledInput {\n  enabled: Boolean!\n}",
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
  modules: [module0, module1],
  compatibility,
});
}

const AppModuleFamily = defineDocumentModelFamily({
  versions: [createAppModuleV1()],
  upgrades: [],
});

export const AppModuleV1 = AppModuleFamily.at(1);
export const documentModels = AppModuleFamily.modules;
export const upgradeManifests = [AppModuleFamily.upgradeManifest];
