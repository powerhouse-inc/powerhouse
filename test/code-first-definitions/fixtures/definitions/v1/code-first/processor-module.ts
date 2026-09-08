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

function createProcessorModuleV1() {
const ProcessorModuleState: ObjectDescriptor = ph.object("ProcessorModuleState", {
description: "Configuration for a processor contributed by the package. A processor receives\noperations from documents of matching types and runs server-side logic (e.g.\nbuilding a read model, indexing, syncing to an external system).",
fields: {
"name": ph.String({ required: true }),
"type": ph.String({ required: true }),
"documentTypes": ph.list(ph.ref(() => DocumentTypeItem, { required: true }), { required: true }),
"status": ph.ref(() => StatusType, { required: true }),
"processorApps": ph.list(ph.String({ required: true }), { required: true })
},
});

const DocumentTypeItem: ObjectDescriptor = ph.object("DocumentTypeItem", {
description: "A document type id (e.g. 'my-org/invoice') attached to the processor with a stable entry id.",
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
  id: "powerhouse/processor",
  name: "Processor Module",
  description: "Declares a processor (a server-side function that reacts to document operations to build read models, send notifications, sync to external systems, etc.) shipped by a Vetra Reactor Package. Create one Processor Module document per processor: pick the processor type, list the document types it subscribes to, attach it to any drive apps that should run it, and mark it CONFIRMED to trigger codegen of the processor scaffold under `processors/`.",
  extension: ".processor",
  version: 1,
  author: {"name":"Powerhouse","website":"https://powerhouse.inc"},
  changeLog: [],
  specifications: {
    auxiliaryTypes: [DocumentTypeItem, StatusType],
    global: {
      schema: ProcessorModuleState,
      initialValue: {"name":"","type":"","documentTypes":[],"status":"DRAFT","processorApps":[]},
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
description: "Set the processor's identity, kind, lifecycle status, subscribed document types, and attached drive apps.",
operations: ({ global, local }) => ({
"setProcessorName": global({
description: "Set the display name of the processor. Also determines the generated folder name under `processors/`.",
input: ph.input("SetProcessorNameInput", { fields: {
"name": ph.String({ required: true })
} }),
template: "",
reducerTemplate: "",
reduceLegacy(_state, _action, _dispatch) {},
}),
"setProcessorType": global({
description: "Set the processor implementation kind (e.g. 'read-model', 'relational-db'). Determines which scaffold codegen emits.",
input: ph.input("SetProcessorTypeInput", { fields: {
"type": ph.String({ required: true })
} }),
template: "",
reducerTemplate: "",
reduceLegacy(_state, _action, _dispatch) {},
}),
"addDocumentType": global({
description: "Subscribe the processor to a document type. Caller supplies a stable id so the entry can be removed later.",
input: ph.input("AddDocumentTypeInput", { fields: {
"id": ph.OID({ required: true }),
"documentType": ph.String({ required: true })
} }),
template: "",
reducerTemplate: "",
reduceLegacy(_state, _action, _dispatch) {},
}),
"removeDocumentType": global({
description: "Unsubscribe the processor from a document type by removing its entry id.",
input: ph.input("RemoveDocumentTypeInput", { fields: {
"id": ph.OID({ required: true })
} }),
template: "",
reducerTemplate: "",
reduceLegacy(_state, _action, _dispatch) {},
}),
"addProcessorApp": global({
description: "Attach the processor to a drive app by name. The processor will run in the context of that app.",
input: ph.input("AddProcessorAppInput", { fields: {
"processorApp": ph.String({ required: true })
} }),
template: "",
reducerTemplate: "",
reduceLegacy(_state, _action, _dispatch) {},
}),
"removeProcessorApp": global({
description: "Detach the processor from a drive app by name. No-op if the app is not currently attached.",
input: ph.input("RemoveProcessorAppInput", { fields: {
"processorApp": ph.String({ required: true })
} }),
template: "",
reducerTemplate: "",
reduceLegacy(_state, _action, _dispatch) {},
}),
"setProcessorStatus": global({
description: "Move the processor between DRAFT and CONFIRMED. Codegen only runs once the status is CONFIRMED.",
input: ph.input("SetProcessorStatusInput", { fields: {
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
              "value": "Configuration for a processor contributed by the package. A processor receives\noperations from documents of matching types and runs server-side logic (e.g.\nbuilding a read model, indexing, syncing to an external system).",
              "block": true
            },
            "name": {
              "kind": "Name",
              "value": "ProcessorModuleState"
            },
            "interfaces": [],
            "directives": [],
            "fields": [
              {
                "kind": "FieldDefinition",
                "description": {
                  "kind": "StringValue",
                  "value": "Display name of the processor. Also determines the generated folder name under `processors/`.",
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
                  "value": "Processor implementation kind (e.g. 'read-model', 'relational-db'). Determines which scaffold codegen emits.",
                  "block": true
                },
                "name": {
                  "kind": "Name",
                  "value": "type"
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
                  "value": "Document types this processor subscribes to. Each entry has a stable id so it can be removed individually.",
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
                  "value": "Lifecycle status. While DRAFT the processor definition is editable and codegen is skipped; switching to CONFIRMED triggers scaffold generation.",
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
                  "value": "Drive-app names this processor is attached to. The processor runs in the context of each listed app.",
                  "block": true
                },
                "name": {
                  "kind": "Name",
                  "value": "processorApps"
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
            "kind": "ObjectTypeDefinition",
            "description": {
              "kind": "StringValue",
              "value": "A document type id (e.g. 'my-org/invoice') attached to the processor with a stable entry id.",
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
                  "value": "Document type id this processor subscribes to.",
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
              "value": "SetProcessorNameInput"
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
              "value": "SetProcessorTypeInput"
            },
            "directives": [],
            "fields": [
              {
                "kind": "InputValueDefinition",
                "name": {
                  "kind": "Name",
                  "value": "type"
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
              "value": "AddProcessorAppInput"
            },
            "directives": [],
            "fields": [
              {
                "kind": "InputValueDefinition",
                "name": {
                  "kind": "Name",
                  "value": "processorApp"
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
              "value": "RemoveProcessorAppInput"
            },
            "directives": [],
            "fields": [
              {
                "kind": "InputValueDefinition",
                "name": {
                  "kind": "Name",
                  "value": "processorApp"
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
              "value": "SetProcessorStatusInput"
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
        "name": "ProcessorModuleState",
        "description": "Configuration for a processor contributed by the package. A processor receives\noperations from documents of matching types and runs server-side logic (e.g.\nbuilding a read model, indexing, syncing to an external system).",
        "fields": [
          {
            "key": "name",
            "name": "name",
            "description": "Display name of the processor. Also determines the generated folder name under `processors/`.",
            "deprecated": null,
            "type": {
              "kind": "scalar",
              "name": "String",
              "required": true
            }
          },
          {
            "key": "type",
            "name": "type",
            "description": "Processor implementation kind (e.g. 'read-model', 'relational-db'). Determines which scaffold codegen emits.",
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
            "description": "Document types this processor subscribes to. Each entry has a stable id so it can be removed individually.",
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
            "description": "Lifecycle status. While DRAFT the processor definition is editable and codegen is skipped; switching to CONFIRMED triggers scaffold generation.",
            "deprecated": null,
            "type": {
              "kind": "named",
              "name": "StatusType",
              "required": true
            }
          },
          {
            "key": "processorApps",
            "name": "processorApps",
            "description": "Drive-app names this processor is attached to. The processor runs in the context of each listed app.",
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
      {
        "kind": "object",
        "name": "DocumentTypeItem",
        "description": "A document type id (e.g. 'my-org/invoice') attached to the processor with a stable entry id.",
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
            "description": "Document type id this processor subscribes to.",
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
          "name": "ProcessorModuleState",
          "required": true
        },
        "initialValue": {
          "name": "",
          "type": "",
          "documentTypes": [],
          "status": "DRAFT",
          "processorApps": []
        },
        "examples": [],
        "unknownKeys": "preserve",
        "materialized": {
          "schema": "\"\"\"\nConfiguration for a processor contributed by the package. A processor receives\noperations from documents of matching types and runs server-side logic (e.g.\nbuilding a read model, indexing, syncing to an external system).\n\"\"\"\ntype ProcessorModuleState {\n  \"\"\"Display name of the processor. Also determines the generated folder name under `processors/`.\"\"\"\n  name: String!\n  \"\"\"Processor implementation kind (e.g. 'read-model', 'relational-db'). Determines which scaffold codegen emits.\"\"\"\n  type: String!\n  \"\"\"Document types this processor subscribes to. Each entry has a stable id so it can be removed individually.\"\"\"\n  documentTypes: [DocumentTypeItem!]!\n  \"\"\"Lifecycle status. While DRAFT the processor definition is editable and codegen is skipped; switching to CONFIRMED triggers scaffold generation.\"\"\"\n  status: StatusType!\n  \"\"\"Drive-app names this processor is attached to. The processor runs in the context of each listed app.\"\"\"\n  processorApps: [String!]!\n}\n\n\"\"\"A document type id (e.g. 'my-org/invoice') attached to the processor with a stable entry id.\"\"\"\ntype DocumentTypeItem {\n  \"\"\"Stable identifier for the entry; used to remove it.\"\"\"\n  id: OID!\n  \"\"\"Document type id this processor subscribes to.\"\"\"\n  documentType: String!\n}\n\n\"\"\"\nLifecycle status of a module definition.\n- DRAFT: still being edited; codegen does not run.\n- CONFIRMED: locked in; codegen produces the corresponding scaffold.\n\"\"\"\nenum StatusType {\n  DRAFT\n  CONFIRMED\n}",
          "initialValue": "{\n  \"name\": \"\",\n  \"type\": \"\",\n  \"documentTypes\": [],\n  \"status\": \"DRAFT\",\n \"processorApps\": []\n}",
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
        "id": "91ad39c1-4e8b-4127-b3c8-e835b85e6360",
        "key": "base_operations",
        "name": "base_operations",
        "description": "Set the processor's identity, kind, lifecycle status, subscribed document types, and attached drive apps.",
        "operations": [
          {
            "id": "6f3a5c90-39f2-4302-a073-6195a71c5054",
            "key": "SET_PROCESSOR_NAME",
            "name": "SET_PROCESSOR_NAME",
            "description": "Set the display name of the processor. Also determines the generated folder name under `processors/`.",
            "actionType": "SET_PROCESSOR_NAME",
            "creatorKey": "setProcessorName",
            "scope": "global",
            "input": {
              "kind": "input",
              "name": "SetProcessorNameInput",
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
            "id": "b8f28bb4-c6ae-40e6-86fa-29ef14ff8667",
            "key": "SET_PROCESSOR_TYPE",
            "name": "SET_PROCESSOR_TYPE",
            "description": "Set the processor implementation kind (e.g. 'read-model', 'relational-db'). Determines which scaffold codegen emits.",
            "actionType": "SET_PROCESSOR_TYPE",
            "creatorKey": "setProcessorType",
            "scope": "global",
            "input": {
              "kind": "input",
              "name": "SetProcessorTypeInput",
              "description": null,
              "unknownKeys": "preserve",
              "fields": [
                {
                  "key": "type",
                  "name": "type",
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
            "id": "fbbd7a71-c495-4efc-b8f6-1e57798dbbb4",
            "key": "ADD_DOCUMENT_TYPE",
            "name": "ADD_DOCUMENT_TYPE",
            "description": "Subscribe the processor to a document type. Caller supplies a stable id so the entry can be removed later.",
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
            "id": "544d413f-423c-4d97-9570-84a19bffeab9",
            "key": "REMOVE_DOCUMENT_TYPE",
            "name": "REMOVE_DOCUMENT_TYPE",
            "description": "Unsubscribe the processor from a document type by removing its entry id.",
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
            "id": "df5eb500-7308-498c-9b80-028878ee198b",
            "key": "ADD_PROCESSOR_APP",
            "name": "ADD_PROCESSOR_APP",
            "description": "Attach the processor to a drive app by name. The processor will run in the context of that app.",
            "actionType": "ADD_PROCESSOR_APP",
            "creatorKey": "addProcessorApp",
            "scope": "global",
            "input": {
              "kind": "input",
              "name": "AddProcessorAppInput",
              "description": null,
              "unknownKeys": "preserve",
              "fields": [
                {
                  "key": "processorApp",
                  "name": "processorApp",
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
            "id": "07e4168f-1a7b-41ef-953d-219028be7bb9",
            "key": "REMOVE_PROCESSOR_APP",
            "name": "REMOVE_PROCESSOR_APP",
            "description": "Detach the processor from a drive app by name. No-op if the app is not currently attached.",
            "actionType": "REMOVE_PROCESSOR_APP",
            "creatorKey": "removeProcessorApp",
            "scope": "global",
            "input": {
              "kind": "input",
              "name": "RemoveProcessorAppInput",
              "description": null,
              "unknownKeys": "preserve",
              "fields": [
                {
                  "key": "processorApp",
                  "name": "processorApp",
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
            "id": "7b6706eb-5e25-4d64-829a-e3a251380fd1",
            "key": "SET_PROCESSOR_STATUS",
            "name": "SET_PROCESSOR_STATUS",
            "description": "Move the processor between DRAFT and CONFIRMED. Codegen only runs once the status is CONFIRMED.",
            "actionType": "SET_PROCESSOR_STATUS",
            "creatorKey": "setProcessorStatus",
            "scope": "global",
            "input": {
              "kind": "input",
              "name": "SetProcessorStatusInput",
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
        "schema": "\"\"\"\nConfiguration for a processor contributed by the package. A processor receives\noperations from documents of matching types and runs server-side logic (e.g.\nbuilding a read model, indexing, syncing to an external system).\n\"\"\"\ntype ProcessorModuleState {\n  \"\"\"Display name of the processor. Also determines the generated folder name under `processors/`.\"\"\"\n  name: String!\n  \"\"\"Processor implementation kind (e.g. 'read-model', 'relational-db'). Determines which scaffold codegen emits.\"\"\"\n  type: String!\n  \"\"\"Document types this processor subscribes to. Each entry has a stable id so it can be removed individually.\"\"\"\n  documentTypes: [DocumentTypeItem!]!\n  \"\"\"Lifecycle status. While DRAFT the processor definition is editable and codegen is skipped; switching to CONFIRMED triggers scaffold generation.\"\"\"\n  status: StatusType!\n  \"\"\"Drive-app names this processor is attached to. The processor runs in the context of each listed app.\"\"\"\n  processorApps: [String!]!\n}\n\n\"\"\"A document type id (e.g. 'my-org/invoice') attached to the processor with a stable entry id.\"\"\"\ntype DocumentTypeItem {\n  \"\"\"Stable identifier for the entry; used to remove it.\"\"\"\n  id: OID!\n  \"\"\"Document type id this processor subscribes to.\"\"\"\n  documentType: String!\n}\n\n\"\"\"\nLifecycle status of a module definition.\n- DRAFT: still being edited; codegen does not run.\n- CONFIRMED: locked in; codegen produces the corresponding scaffold.\n\"\"\"\nenum StatusType {\n  DRAFT\n  CONFIRMED\n}",
        "examples": [],
        "initialValue": "{\n  \"name\": \"\",\n  \"type\": \"\",\n  \"documentTypes\": [],\n  \"status\": \"DRAFT\",\n \"processorApps\": []\n}"
      }
    },
    "modules": [
      {
        "id": "91ad39c1-4e8b-4127-b3c8-e835b85e6360",
        "name": "base_operations",
        "description": "Set the processor's identity, kind, lifecycle status, subscribed document types, and attached drive apps.",
        "operations": [
          {
            "id": "6f3a5c90-39f2-4302-a073-6195a71c5054",
            "name": "SET_PROCESSOR_NAME",
            "description": "Set the display name of the processor. Also determines the generated folder name under `processors/`.",
            "schema": "input SetProcessorNameInput {\n  name: String!\n}",
            "template": "",
            "reducer": "",
            "errors": [],
            "examples": [],
            "scope": "global"
          },
          {
            "id": "b8f28bb4-c6ae-40e6-86fa-29ef14ff8667",
            "name": "SET_PROCESSOR_TYPE",
            "description": "Set the processor implementation kind (e.g. 'read-model', 'relational-db'). Determines which scaffold codegen emits.",
            "schema": "input SetProcessorTypeInput {\n  type: String!\n}",
            "template": "",
            "reducer": "",
            "errors": [],
            "examples": [],
            "scope": "global"
          },
          {
            "id": "fbbd7a71-c495-4efc-b8f6-1e57798dbbb4",
            "name": "ADD_DOCUMENT_TYPE",
            "description": "Subscribe the processor to a document type. Caller supplies a stable id so the entry can be removed later.",
            "schema": "input AddDocumentTypeInput {\n  id: OID!\n  documentType: String!\n}",
            "template": "",
            "reducer": "",
            "errors": [],
            "examples": [],
            "scope": "global"
          },
          {
            "id": "544d413f-423c-4d97-9570-84a19bffeab9",
            "name": "REMOVE_DOCUMENT_TYPE",
            "description": "Unsubscribe the processor from a document type by removing its entry id.",
            "schema": "input RemoveDocumentTypeInput {\n  id: OID!\n}",
            "template": "",
            "reducer": "",
            "errors": [],
            "examples": [],
            "scope": "global"
          },
          {
            "id": "df5eb500-7308-498c-9b80-028878ee198b",
            "name": "ADD_PROCESSOR_APP",
            "description": "Attach the processor to a drive app by name. The processor will run in the context of that app.",
            "schema": "input AddProcessorAppInput {\n  processorApp: String!\n}",
            "template": "",
            "reducer": "",
            "errors": [],
            "examples": [],
            "scope": "global"
          },
          {
            "id": "07e4168f-1a7b-41ef-953d-219028be7bb9",
            "name": "REMOVE_PROCESSOR_APP",
            "description": "Detach the processor from a drive app by name. No-op if the app is not currently attached.",
            "schema": "input RemoveProcessorAppInput {\n  processorApp: String!\n}",
            "template": "",
            "reducer": "",
            "errors": [],
            "examples": [],
            "scope": "global"
          },
          {
            "id": "7b6706eb-5e25-4d64-829a-e3a251380fd1",
            "name": "SET_PROCESSOR_STATUS",
            "description": "Move the processor between DRAFT and CONFIRMED. Codegen only runs once the status is CONFIRMED.",
            "schema": "input SetProcessorStatusInput {\n  status: StatusType!\n}",
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

const ProcessorModuleFamily = defineDocumentModelFamily({
  versions: [createProcessorModuleV1()],
  upgrades: [],
});

export const ProcessorModuleV1 = ProcessorModuleFamily.at(1);
export const documentModels = ProcessorModuleFamily.modules;
export const upgradeManifests = [ProcessorModuleFamily.upgradeManifest];
