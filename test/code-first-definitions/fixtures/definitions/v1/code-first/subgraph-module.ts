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

function createSubgraphModuleV1() {
const SubgraphModuleState: ObjectDescriptor = ph.object("SubgraphModuleState", {
description: "Configuration for a GraphQL subgraph contributed by the package. The subgraph\nis served by Switchboard and stitched into the unified Powerhouse API.",
fields: {
"name": ph.String({ required: true }),
"status": ph.ref(() => StatusType, { required: true })
},
});

const StatusType: EnumDescriptor = ph.enum("StatusType", {
description: "Lifecycle status of a module definition.\n- DRAFT: still being edited; codegen does not run.\n- CONFIRMED: locked in; codegen produces the corresponding scaffold.",
values: ["DRAFT","CONFIRMED"] as const,
});

const model = defineDocumentModel({
  id: "powerhouse/subgraph",
  name: "Subgraph Module",
  description: "Declares a GraphQL subgraph (a slice of the Switchboard API contributed by the package) shipped by a Vetra Reactor Package. Create one Subgraph Module document per subgraph, then mark it CONFIRMED to trigger codegen of the subgraph scaffold under `subgraphs/` — the resolvers and schema you flesh out there are stitched into the Switchboard graph at runtime.",
  extension: ".subgraph",
  version: 1,
  author: {"name":"Powerhouse","website":"https://powerhouse.inc"},
  changeLog: [],
  specifications: {
    auxiliaryTypes: [StatusType],
    global: {
      schema: SubgraphModuleState,
      initialValue: {"name":"","status":"DRAFT"},
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
description: "Set the subgraph's identity and lifecycle status.",
operations: ({ global, local }) => ({
"setSubgraphName": global({
description: "Set the display name of the subgraph. Also determines the generated folder under `subgraphs/` and the route segment Switchboard mounts it at.",
input: ph.input("SetSubgraphNameInput", { fields: {
"name": ph.String({ required: true })
} }),
template: "",
reducerTemplate: "",
reduceLegacy(_state, _action, _dispatch) {},
}),
"setSubgraphStatus": global({
description: "Move the subgraph between DRAFT and CONFIRMED. Codegen only runs once the status is CONFIRMED.",
input: ph.input("SetSubgraphStatusInput", { fields: {
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
              "value": "Configuration for a GraphQL subgraph contributed by the package. The subgraph\nis served by Switchboard and stitched into the unified Powerhouse API.",
              "block": true
            },
            "name": {
              "kind": "Name",
              "value": "SubgraphModuleState"
            },
            "interfaces": [],
            "directives": [],
            "fields": [
              {
                "kind": "FieldDefinition",
                "description": {
                  "kind": "StringValue",
                  "value": "Display name of the subgraph. Also determines the generated folder name under `subgraphs/` and the route segment Switchboard mounts it at.",
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
                  "value": "Lifecycle status. While DRAFT the subgraph definition is editable and codegen is skipped; switching to CONFIRMED triggers scaffold generation.",
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
              "value": "SetSubgraphNameInput"
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
              "value": "SetSubgraphStatusInput"
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
        "name": "SubgraphModuleState",
        "description": "Configuration for a GraphQL subgraph contributed by the package. The subgraph\nis served by Switchboard and stitched into the unified Powerhouse API.",
        "fields": [
          {
            "key": "name",
            "name": "name",
            "description": "Display name of the subgraph. Also determines the generated folder name under `subgraphs/` and the route segment Switchboard mounts it at.",
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
            "description": "Lifecycle status. While DRAFT the subgraph definition is editable and codegen is skipped; switching to CONFIRMED triggers scaffold generation.",
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
          "name": "SubgraphModuleState",
          "required": true
        },
        "initialValue": {
          "name": "",
          "status": "DRAFT"
        },
        "examples": [],
        "unknownKeys": "preserve",
        "materialized": {
          "schema": "\"\"\"\nConfiguration for a GraphQL subgraph contributed by the package. The subgraph\nis served by Switchboard and stitched into the unified Powerhouse API.\n\"\"\"\ntype SubgraphModuleState {\n  \"\"\"Display name of the subgraph. Also determines the generated folder name under `subgraphs/` and the route segment Switchboard mounts it at.\"\"\"\n  name: String!\n  \"\"\"Lifecycle status. While DRAFT the subgraph definition is editable and codegen is skipped; switching to CONFIRMED triggers scaffold generation.\"\"\"\n  status: StatusType!\n}\n\n\"\"\"\nLifecycle status of a module definition.\n- DRAFT: still being edited; codegen does not run.\n- CONFIRMED: locked in; codegen produces the corresponding scaffold.\n\"\"\"\nenum StatusType {\n  DRAFT\n  CONFIRMED\n}",
          "initialValue": "{\n  \"name\": \"\",\n  \"status\": \"DRAFT\"\n}",
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
        "id": "8af5bda9-6fc7-4427-bfed-1d32d76a552f",
        "key": "base_operations",
        "name": "base_operations",
        "description": "Set the subgraph's identity and lifecycle status.",
        "operations": [
          {
            "id": "d7cd6b6b-01ea-42c8-97e2-288e04b50b42",
            "key": "SET_SUBGRAPH_NAME",
            "name": "SET_SUBGRAPH_NAME",
            "description": "Set the display name of the subgraph. Also determines the generated folder under `subgraphs/` and the route segment Switchboard mounts it at.",
            "actionType": "SET_SUBGRAPH_NAME",
            "creatorKey": "setSubgraphName",
            "scope": "global",
            "input": {
              "kind": "input",
              "name": "SetSubgraphNameInput",
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
            "id": "5a20e641-dc36-428e-8924-ecb07f3f1b94",
            "key": "SET_SUBGRAPH_STATUS",
            "name": "SET_SUBGRAPH_STATUS",
            "description": "Move the subgraph between DRAFT and CONFIRMED. Codegen only runs once the status is CONFIRMED.",
            "actionType": "SET_SUBGRAPH_STATUS",
            "creatorKey": "setSubgraphStatus",
            "scope": "global",
            "input": {
              "kind": "input",
              "name": "SetSubgraphStatusInput",
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
        "schema": "\"\"\"\nConfiguration for a GraphQL subgraph contributed by the package. The subgraph\nis served by Switchboard and stitched into the unified Powerhouse API.\n\"\"\"\ntype SubgraphModuleState {\n  \"\"\"Display name of the subgraph. Also determines the generated folder name under `subgraphs/` and the route segment Switchboard mounts it at.\"\"\"\n  name: String!\n  \"\"\"Lifecycle status. While DRAFT the subgraph definition is editable and codegen is skipped; switching to CONFIRMED triggers scaffold generation.\"\"\"\n  status: StatusType!\n}\n\n\"\"\"\nLifecycle status of a module definition.\n- DRAFT: still being edited; codegen does not run.\n- CONFIRMED: locked in; codegen produces the corresponding scaffold.\n\"\"\"\nenum StatusType {\n  DRAFT\n  CONFIRMED\n}",
        "examples": [],
        "initialValue": "{\n  \"name\": \"\",\n  \"status\": \"DRAFT\"\n}"
      }
    },
    "modules": [
      {
        "id": "8af5bda9-6fc7-4427-bfed-1d32d76a552f",
        "name": "base_operations",
        "description": "Set the subgraph's identity and lifecycle status.",
        "operations": [
          {
            "id": "d7cd6b6b-01ea-42c8-97e2-288e04b50b42",
            "name": "SET_SUBGRAPH_NAME",
            "description": "Set the display name of the subgraph. Also determines the generated folder under `subgraphs/` and the route segment Switchboard mounts it at.",
            "schema": "input SetSubgraphNameInput {\n  name: String!\n}",
            "template": "",
            "reducer": "",
            "errors": [],
            "examples": [],
            "scope": "global"
          },
          {
            "id": "5a20e641-dc36-428e-8924-ecb07f3f1b94",
            "name": "SET_SUBGRAPH_STATUS",
            "description": "Move the subgraph between DRAFT and CONFIRMED. Codegen only runs once the status is CONFIRMED.",
            "schema": "input SetSubgraphStatusInput {\n  status: StatusType!\n}",
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

const SubgraphModuleFamily = defineDocumentModelFamily({
  versions: [createSubgraphModuleV1()],
  upgrades: [],
});

export const SubgraphModuleV1 = SubgraphModuleFamily.at(1);
export const documentModels = SubgraphModuleFamily.modules;
export const upgradeManifests = [SubgraphModuleFamily.upgradeManifest];
