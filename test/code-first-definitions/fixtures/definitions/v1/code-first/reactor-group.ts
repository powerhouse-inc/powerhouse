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

function createReactorGroupV1() {
const ReactorGroupState: ObjectDescriptor = ph.object("ReactorGroupState", {
description: "A member address list gated by the group document's own auth scope. Addresses\nare stored as given and compared case-insensitively, matching how { address }\nprincipals are compared during auth evaluation.",
fields: {
"name": ph.String({ required: true }),
"description": ph.String({ required: true }),
"members": ph.list(ph.String({ required: true }), { required: true })
},
});

const model = defineDocumentModel({
  id: "powerhouse/reactor-group",
  name: "Reactor Group",
  description: "A group of member addresses referenced by { group } principals in the auth scope. Group membership is folded at an operation's position during auth evaluation, so reducers are strict and deterministic: duplicate or unknown members are errors, and membership is capped.",
  extension: ".phrg",
  version: 1,
  author: {"name":"Powerhouse","website":"https://powerhouse.inc"},
  changeLog: [],
  specifications: {
    
    global: {
      schema: ReactorGroupState,
      initialValue: {"name":"","description":"","members":[]},
      examples: [],
    },
    local: {
      schema: null,
      initialValue: {},
      examples: [],
    },
  },
});

const module0 = model.module("group", {
description: "Manage the group's identity and its member address list.",
operations: ({ global, local }) => ({
"setGroupName": global({
description: "Set the display name of the group. The name must be non-empty after trimming and at most 200 characters.",
input: ph.input("SetGroupNameInput", { fields: {
"name": ph.String({ required: true })
} }),
errors: {
"InvalidGroupName": {
  code: "InvalidGroupName",
  name: "InvalidGroupName",
  description: "The group name is empty after trimming or longer than 200 characters.",
  template: "",
}
},
template: "",
reducerTemplate: "",
reduceLegacy(_state, _action, _dispatch) {},
}),
"setGroupDescription": global({
description: "Set the free-text description of the group. The description is at most 2000 characters.",
input: ph.input("SetGroupDescriptionInput", { fields: {
"description": ph.String({ required: true })
} }),
errors: {
"InvalidGroupDescription": {
  code: "InvalidGroupDescription",
  name: "InvalidGroupDescription",
  description: "The group description is longer than 2000 characters.",
  template: "",
}
},
template: "",
reducerTemplate: "",
reduceLegacy(_state, _action, _dispatch) {},
}),
"addMember": global({
description: "Add a member address to the group. The address must be non-empty after trimming, must not already be a member under case-insensitive comparison, and the group must be below the member cap.",
input: ph.input("AddMemberInput", { fields: {
"address": ph.String({ required: true })
} }),
errors: {
"InvalidMemberAddress": {
  code: "InvalidMemberAddress",
  name: "InvalidMemberAddress",
  description: "The member address is empty after trimming.",
  template: "",
},
"DuplicateMember": {
  code: "DuplicateMember",
  name: "DuplicateMember",
  description: "The address is already a member of the group under case-insensitive comparison.",
  template: "",
},
"GroupMemberLimitExceeded": {
  code: "GroupMemberLimitExceeded",
  name: "GroupMemberLimitExceeded",
  description: "The group already holds the maximum number of members.",
  template: "",
}
},
template: "",
reducerTemplate: "",
reduceLegacy(_state, _action, _dispatch) {},
}),
"removeMember": global({
description: "Remove a member address from the group, matched case-insensitively. Removing an address that is not a member is an error.",
input: ph.input("RemoveMemberInput", { fields: {
"address": ph.String({ required: true })
} }),
errors: {
"MemberNotFound": {
  code: "MemberNotFound",
  name: "MemberNotFound",
  description: "The address is not a member of the group under case-insensitive comparison.",
  template: "",
}
},
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
              "value": "A member address list gated by the group document's own auth scope. Addresses\nare stored as given and compared case-insensitively, matching how { address }\nprincipals are compared during auth evaluation.",
              "block": true
            },
            "name": {
              "kind": "Name",
              "value": "ReactorGroupState"
            },
            "interfaces": [],
            "directives": [],
            "fields": [
              {
                "kind": "FieldDefinition",
                "description": {
                  "kind": "StringValue",
                  "value": "Display name of the group.",
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
                  "value": "Free-text description of the group's purpose.",
                  "block": true
                },
                "name": {
                  "kind": "Name",
                  "value": "description"
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
                  "value": "Member wallet addresses. No duplicates under case-insensitive comparison.",
                  "block": true
                },
                "name": {
                  "kind": "Name",
                  "value": "members"
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
            "kind": "InputObjectTypeDefinition",
            "name": {
              "kind": "Name",
              "value": "SetGroupNameInput"
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
              "value": "SetGroupDescriptionInput"
            },
            "directives": [],
            "fields": [
              {
                "kind": "InputValueDefinition",
                "name": {
                  "kind": "Name",
                  "value": "description"
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
              "value": "AddMemberInput"
            },
            "directives": [],
            "fields": [
              {
                "kind": "InputValueDefinition",
                "name": {
                  "kind": "Name",
                  "value": "address"
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
              "value": "RemoveMemberInput"
            },
            "directives": [],
            "fields": [
              {
                "kind": "InputValueDefinition",
                "name": {
                  "kind": "Name",
                  "value": "address"
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
          }
        ]
      },
      "preserveDefinitionOrder": true
    },
    "types": [
      {
        "kind": "object",
        "name": "ReactorGroupState",
        "description": "A member address list gated by the group document's own auth scope. Addresses\nare stored as given and compared case-insensitively, matching how { address }\nprincipals are compared during auth evaluation.",
        "fields": [
          {
            "key": "name",
            "name": "name",
            "description": "Display name of the group.",
            "deprecated": null,
            "type": {
              "kind": "scalar",
              "name": "String",
              "required": true
            }
          },
          {
            "key": "description",
            "name": "description",
            "description": "Free-text description of the group's purpose.",
            "deprecated": null,
            "type": {
              "kind": "scalar",
              "name": "String",
              "required": true
            }
          },
          {
            "key": "members",
            "name": "members",
            "description": "Member wallet addresses. No duplicates under case-insensitive comparison.",
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
      }
    ],
    "state": {
      "global": {
        "root": {
          "kind": "named",
          "name": "ReactorGroupState",
          "required": true
        },
        "initialValue": {
          "name": "",
          "description": "",
          "members": []
        },
        "examples": [],
        "unknownKeys": "preserve",
        "materialized": {
          "schema": "\"\"\"\nA member address list gated by the group document's own auth scope. Addresses\nare stored as given and compared case-insensitively, matching how { address }\nprincipals are compared during auth evaluation.\n\"\"\"\ntype ReactorGroupState {\n  \"\"\"Display name of the group.\"\"\"\n  name: String!\n  \"\"\"Free-text description of the group's purpose.\"\"\"\n  description: String!\n  \"\"\"Member wallet addresses. No duplicates under case-insensitive comparison.\"\"\"\n  members: [String!]!\n}",
          "initialValue": "{\n  \"name\": \"\",\n  \"description\": \"\",\n  \"members\": []\n}",
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
        "id": "efd6d9bb-869e-4565-b1ca-d9b74385eaf7",
        "key": "group",
        "name": "group",
        "description": "Manage the group's identity and its member address list.",
        "operations": [
          {
            "id": "43da2b3d-bad7-40b8-8a84-4cdf892f1519",
            "key": "SET_GROUP_NAME",
            "name": "SET_GROUP_NAME",
            "description": "Set the display name of the group. The name must be non-empty after trimming and at most 200 characters.",
            "actionType": "SET_GROUP_NAME",
            "creatorKey": "setGroupName",
            "scope": "global",
            "input": {
              "kind": "input",
              "name": "SetGroupNameInput",
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
            "errors": [
              {
                "id": "8be0d16c-1f21-4d95-9536-c5a5867d2ba1",
                "key": "InvalidGroupName",
                "code": "InvalidGroupName",
                "name": "InvalidGroupName",
                "description": "The group name is empty after trimming or longer than 200 characters.",
                "template": ""
              }
            ],
            "examples": [],
            "template": "",
            "reducer": ""
          },
          {
            "id": "aa493898-ce6b-4b28-baf3-1b6fd8425138",
            "key": "SET_GROUP_DESCRIPTION",
            "name": "SET_GROUP_DESCRIPTION",
            "description": "Set the free-text description of the group. The description is at most 2000 characters.",
            "actionType": "SET_GROUP_DESCRIPTION",
            "creatorKey": "setGroupDescription",
            "scope": "global",
            "input": {
              "kind": "input",
              "name": "SetGroupDescriptionInput",
              "description": null,
              "unknownKeys": "preserve",
              "fields": [
                {
                  "key": "description",
                  "name": "description",
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
            "errors": [
              {
                "id": "9f0f77a4-6a86-4f5c-9a3f-13a44be29de3",
                "key": "InvalidGroupDescription",
                "code": "InvalidGroupDescription",
                "name": "InvalidGroupDescription",
                "description": "The group description is longer than 2000 characters.",
                "template": ""
              }
            ],
            "examples": [],
            "template": "",
            "reducer": ""
          },
          {
            "id": "e7990be2-2e40-4624-9f96-df759703ba6b",
            "key": "ADD_MEMBER",
            "name": "ADD_MEMBER",
            "description": "Add a member address to the group. The address must be non-empty after trimming, must not already be a member under case-insensitive comparison, and the group must be below the member cap.",
            "actionType": "ADD_MEMBER",
            "creatorKey": "addMember",
            "scope": "global",
            "input": {
              "kind": "input",
              "name": "AddMemberInput",
              "description": null,
              "unknownKeys": "preserve",
              "fields": [
                {
                  "key": "address",
                  "name": "address",
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
            "errors": [
              {
                "id": "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
                "key": "InvalidMemberAddress",
                "code": "InvalidMemberAddress",
                "name": "InvalidMemberAddress",
                "description": "The member address is empty after trimming.",
                "template": ""
              },
              {
                "id": "b2c1a9de-58e6-4f3f-9f2a-7f6b1e2d4c5a",
                "key": "DuplicateMember",
                "code": "DuplicateMember",
                "name": "DuplicateMember",
                "description": "The address is already a member of the group under case-insensitive comparison.",
                "template": ""
              },
              {
                "id": "c4d5e6f7-0a1b-4c2d-8e3f-9a0b1c2d3e4f",
                "key": "GroupMemberLimitExceeded",
                "code": "GroupMemberLimitExceeded",
                "name": "GroupMemberLimitExceeded",
                "description": "The group already holds the maximum number of members.",
                "template": ""
              }
            ],
            "examples": [],
            "template": "",
            "reducer": ""
          },
          {
            "id": "b1309319-48b7-42b2-a40e-1fecef9a09a4",
            "key": "REMOVE_MEMBER",
            "name": "REMOVE_MEMBER",
            "description": "Remove a member address from the group, matched case-insensitively. Removing an address that is not a member is an error.",
            "actionType": "REMOVE_MEMBER",
            "creatorKey": "removeMember",
            "scope": "global",
            "input": {
              "kind": "input",
              "name": "RemoveMemberInput",
              "description": null,
              "unknownKeys": "preserve",
              "fields": [
                {
                  "key": "address",
                  "name": "address",
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
            "errors": [
              {
                "id": "d6e7f8a9-1b2c-4d3e-9f4a-0b1c2d3e4f5a",
                "key": "MemberNotFound",
                "code": "MemberNotFound",
                "name": "MemberNotFound",
                "description": "The address is not a member of the group under case-insensitive comparison.",
                "template": ""
              }
            ],
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
        "schema": "\"\"\"\nA member address list gated by the group document's own auth scope. Addresses\nare stored as given and compared case-insensitively, matching how { address }\nprincipals are compared during auth evaluation.\n\"\"\"\ntype ReactorGroupState {\n  \"\"\"Display name of the group.\"\"\"\n  name: String!\n  \"\"\"Free-text description of the group's purpose.\"\"\"\n  description: String!\n  \"\"\"Member wallet addresses. No duplicates under case-insensitive comparison.\"\"\"\n  members: [String!]!\n}",
        "examples": [],
        "initialValue": "{\n  \"name\": \"\",\n  \"description\": \"\",\n  \"members\": []\n}"
      }
    },
    "modules": [
      {
        "id": "efd6d9bb-869e-4565-b1ca-d9b74385eaf7",
        "name": "group",
        "description": "Manage the group's identity and its member address list.",
        "operations": [
          {
            "id": "43da2b3d-bad7-40b8-8a84-4cdf892f1519",
            "name": "SET_GROUP_NAME",
            "description": "Set the display name of the group. The name must be non-empty after trimming and at most 200 characters.",
            "schema": "input SetGroupNameInput {\n  name: String!\n}",
            "template": "",
            "reducer": "",
            "errors": [
              {
                "id": "8be0d16c-1f21-4d95-9536-c5a5867d2ba1",
                "code": "InvalidGroupName",
                "name": "InvalidGroupName",
                "description": "The group name is empty after trimming or longer than 200 characters.",
                "template": ""
              }
            ],
            "examples": [],
            "scope": "global"
          },
          {
            "id": "aa493898-ce6b-4b28-baf3-1b6fd8425138",
            "name": "SET_GROUP_DESCRIPTION",
            "description": "Set the free-text description of the group. The description is at most 2000 characters.",
            "schema": "input SetGroupDescriptionInput {\n  description: String!\n}",
            "template": "",
            "reducer": "",
            "errors": [
              {
                "id": "9f0f77a4-6a86-4f5c-9a3f-13a44be29de3",
                "code": "InvalidGroupDescription",
                "name": "InvalidGroupDescription",
                "description": "The group description is longer than 2000 characters.",
                "template": ""
              }
            ],
            "examples": [],
            "scope": "global"
          },
          {
            "id": "e7990be2-2e40-4624-9f96-df759703ba6b",
            "name": "ADD_MEMBER",
            "description": "Add a member address to the group. The address must be non-empty after trimming, must not already be a member under case-insensitive comparison, and the group must be below the member cap.",
            "schema": "input AddMemberInput {\n  address: String!\n}",
            "template": "",
            "reducer": "",
            "errors": [
              {
                "id": "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
                "code": "InvalidMemberAddress",
                "name": "InvalidMemberAddress",
                "description": "The member address is empty after trimming.",
                "template": ""
              },
              {
                "id": "b2c1a9de-58e6-4f3f-9f2a-7f6b1e2d4c5a",
                "code": "DuplicateMember",
                "name": "DuplicateMember",
                "description": "The address is already a member of the group under case-insensitive comparison.",
                "template": ""
              },
              {
                "id": "c4d5e6f7-0a1b-4c2d-8e3f-9a0b1c2d3e4f",
                "code": "GroupMemberLimitExceeded",
                "name": "GroupMemberLimitExceeded",
                "description": "The group already holds the maximum number of members.",
                "template": ""
              }
            ],
            "examples": [],
            "scope": "global"
          },
          {
            "id": "b1309319-48b7-42b2-a40e-1fecef9a09a4",
            "name": "REMOVE_MEMBER",
            "description": "Remove a member address from the group, matched case-insensitively. Removing an address that is not a member is an error.",
            "schema": "input RemoveMemberInput {\n  address: String!\n}",
            "template": "",
            "reducer": "",
            "errors": [
              {
                "id": "d6e7f8a9-1b2c-4d3e-9f4a-0b1c2d3e4f5a",
                "code": "MemberNotFound",
                "name": "MemberNotFound",
                "description": "The address is not a member of the group under case-insensitive comparison.",
                "template": ""
              }
            ],
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

const ReactorGroupFamily = defineDocumentModelFamily({
  versions: [createReactorGroupV1()],
  upgrades: [],
});

export const ReactorGroupV1 = ReactorGroupFamily.at(1);
export const documentModels = ReactorGroupFamily.modules;
export const upgradeManifests = [ReactorGroupFamily.upgradeManifest];
