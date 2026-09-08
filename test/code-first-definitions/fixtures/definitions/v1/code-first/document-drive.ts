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

function createDocumentDriveV1() {
const FolderNode: ObjectDescriptor = ph.object("FolderNode", {
fields: {
"id": ph.String({ required: true }),
"name": ph.String({ required: true }),
"kind": ph.String({ required: true }),
"parentFolder": ph.String()
},
});

const FileNode: ObjectDescriptor = ph.object("FileNode", {
fields: {
"id": ph.String({ required: true }),
"name": ph.String({ required: true }),
"kind": ph.String({ required: true }),
"documentType": ph.String({ required: true }),
"parentFolder": ph.String()
},
});

const Node: UnionDescriptor = ph.union("Node", {
members: [FolderNode, FileNode],
});

const DocumentDriveState: ObjectDescriptor = ph.object("DocumentDriveState", {
fields: {
"name": ph.String({ required: true }),
"nodes": ph.list(ph.ref(() => Node, { required: true }), { required: true }),
"icon": ph.String()
},
});

const ListenerFilter: ObjectDescriptor = ph.object("ListenerFilter", {
fields: {
"documentType": ph.list(ph.String({ required: true })),
"documentId": ph.list(ph.ID({ required: true })),
"scope": ph.list(ph.String({ required: true })),
"branch": ph.list(ph.String({ required: true }))
},
});

const TransmitterType: EnumDescriptor = ph.enum("TransmitterType", {
values: ["Internal","SwitchboardPush","PullResponder","SecureConnect","MatrixConnect","RESTWebhook"] as const,
});

const ListenerCallInfo: ObjectDescriptor = ph.object("ListenerCallInfo", {
fields: {
"transmitterType": ph.ref(() => TransmitterType),
"name": ph.String(),
"data": ph.String()
},
});

const Listener: ObjectDescriptor = ph.object("Listener", {
fields: {
"listenerId": ph.ID({ required: true }),
"label": ph.String(),
"block": ph.Boolean({ required: true }),
"system": ph.Boolean({ required: true }),
"filter": ph.ref(() => ListenerFilter, { required: true }),
"callInfo": ph.ref(() => ListenerCallInfo)
},
});

const TriggerType: EnumDescriptor = ph.enum("TriggerType", {
values: ["PullResponder"] as const,
});

const PullResponderTriggerData: ObjectDescriptor = ph.object("PullResponderTriggerData", {
fields: {
"listenerId": ph.ID({ required: true }),
"url": ph.String({ required: true }),
"interval": ph.String({ required: true })
},
});

const TriggerData: UnionDescriptor = ph.union("TriggerData", {
members: [PullResponderTriggerData],
});

const Trigger: ObjectDescriptor = ph.object("Trigger", {
fields: {
"id": ph.ID({ required: true }),
"type": ph.ref(() => TriggerType, { required: true }),
"data": ph.ref(() => TriggerData)
},
});

const DocumentDriveLocalState: ObjectDescriptor = ph.object("DocumentDriveLocalState", {
fields: {
"sharingType": ph.String(),
"listeners": ph.list(ph.ref(() => Listener, { required: true }), { required: true }),
"triggers": ph.list(ph.ref(() => Trigger, { required: true }), { required: true }),
"availableOffline": ph.Boolean({ required: true })
},
});

const ListenerFilterInput: InputDescriptor = ph.input("ListenerFilterInput", {
fields: {
"documentType": ph.list(ph.String({ required: true })),
"documentId": ph.list(ph.ID({ required: true })),
"scope": ph.list(ph.String({ required: true })),
"branch": ph.list(ph.String({ required: true }))
},
});

const ListenerCallInfoInput: InputDescriptor = ph.input("ListenerCallInfoInput", {
fields: {
"transmitterType": ph.ref(() => TransmitterType),
"name": ph.String(),
"data": ph.String()
},
});

const ListenerInput: InputDescriptor = ph.input("ListenerInput", {
fields: {
"listenerId": ph.ID({ required: true }),
"label": ph.String(),
"block": ph.Boolean({ required: true }),
"system": ph.Boolean({ required: true }),
"filter": ph.ref(() => ListenerFilterInput, { required: true }),
"callInfo": ph.ref(() => ListenerCallInfoInput)
},
});

const PullResponderTriggerDataInput: InputDescriptor = ph.input("PullResponderTriggerDataInput", {
fields: {
"listenerId": ph.ID({ required: true }),
"url": ph.String({ required: true }),
"interval": ph.String({ required: true })
},
});

const TriggerInput: InputDescriptor = ph.input("TriggerInput", {
fields: {
"id": ph.ID({ required: true }),
"type": ph.ref(() => TriggerType, { required: true }),
"data": ph.ref(() => PullResponderTriggerDataInput)
},
});

const model = defineDocumentModel({
  id: "powerhouse/document-drive",
  name: "DocumentDrive",
  description: "",
  extension: "phdd",
  version: 1,
  author: {"name":"Powerhouse Inc","website":"https://www.powerhouse.inc/"},
  changeLog: [],
  specifications: {
    auxiliaryTypes: [FolderNode, FileNode, Node, ListenerFilter, TransmitterType, ListenerCallInfo, Listener, TriggerType, PullResponderTriggerData, TriggerData, Trigger, ListenerFilterInput, ListenerCallInfoInput, ListenerInput, PullResponderTriggerDataInput, TriggerInput],
    global: {
      schema: DocumentDriveState,
      initialValue: {"name":"","nodes":[],"icon":null},
      examples: [],
    },
    local: {
      schema: DocumentDriveLocalState,
      initialValue: {"listeners":[],"triggers":[],"sharingType":"private","availableOffline":false},
      examples: [],
    },
  },
});

const module0 = model.module("Node", {
description: "",
operations: ({ global, local }) => ({
"addFile": global({
description: "",
input: ph.input("AddFileInput", { fields: {
"id": ph.ID({ required: true }),
"name": ph.String({ required: true }),
"documentType": ph.String({ required: true }),
"parentFolder": ph.ID()
} }),
template: "",
reducerTemplate: "",
reduceLegacy(_state, _action, _dispatch) {},
}),
"addFolder": global({
description: "",
input: ph.input("AddFolderInput", { fields: {
"id": ph.ID({ required: true }),
"name": ph.String({ required: true }),
"parentFolder": ph.ID()
} }),
template: "",
reducerTemplate: "",
reduceLegacy(_state, _action, _dispatch) {},
}),
"deleteNode": global({
description: "",
input: ph.input("DeleteNodeInput", { fields: {
"id": ph.ID({ required: true })
} }),
template: "",
reducerTemplate: "",
reduceLegacy(_state, _action, _dispatch) {},
}),
"updateFile": global({
description: "",
input: ph.input("UpdateFileInput", { fields: {
"id": ph.ID({ required: true }),
"parentFolder": ph.ID(),
"name": ph.String(),
"documentType": ph.String()
} }),
template: "",
reducerTemplate: "",
reduceLegacy(_state, _action, _dispatch) {},
}),
"updateNode": global({
description: "",
input: ph.input("UpdateNodeInput", { fields: {
"id": ph.ID({ required: true }),
"parentFolder": ph.ID(),
"name": ph.String()
} }),
template: "",
reducerTemplate: "",
reduceLegacy(_state, _action, _dispatch) {},
}),
"copyNode": global({
description: "",
input: ph.input("CopyNodeInput", { fields: {
"srcId": ph.ID({ required: true }),
"targetId": ph.ID({ required: true }),
"targetName": ph.String(),
"targetParentFolder": ph.ID()
} }),
template: "",
reducerTemplate: "",
reduceLegacy(_state, _action, _dispatch) {},
}),
"moveNode": global({
description: "",
input: ph.input("MoveNodeInput", { fields: {
"srcFolder": ph.ID({ required: true }),
"targetParentFolder": ph.ID()
} }),
template: "",
reducerTemplate: "",
reduceLegacy(_state, _action, _dispatch) {},
})
}),
});

const module1 = model.module("Drive", {
description: "",
operations: ({ global, local }) => ({
"setDriveName": global({
description: "",
input: ph.input("SetDriveNameInput", { fields: {
"name": ph.String({ required: true })
} }),
template: "",
reducerTemplate: "",
reduceLegacy(_state, _action, _dispatch) {},
}),
"setDriveIcon": global({
description: "",
input: ph.input("SetDriveIconInput", { fields: {
"icon": ph.String({ required: true })
} }),
template: "",
reducerTemplate: "",
reduceLegacy(_state, _action, _dispatch) {},
}),
"setSharingType": local({
description: "",
input: ph.input("SetSharingTypeInput", { fields: {
"type": ph.String({ required: true })
} }),
template: "",
reducerTemplate: "",
reduceLegacy(_state, _action, _dispatch) {},
}),
"setAvailableOffline": local({
description: "",
input: ph.input("SetAvailableOfflineInput", { fields: {
"availableOffline": ph.Boolean({ required: true })
} }),
template: "",
reducerTemplate: "",
reduceLegacy(_state, _action, _dispatch) {},
}),
"addListener": local({
description: "",
input: ph.input("AddListenerInput", { fields: {
"listener": ph.ref(() => ListenerInput, { required: true })
} }),
template: "",
reducerTemplate: "",
reduceLegacy(_state, _action, _dispatch) {},
}),
"removeListener": local({
description: "",
input: ph.input("RemoveListenerInput", { fields: {
"listenerId": ph.String({ required: true })
} }),
template: "",
reducerTemplate: "",
reduceLegacy(_state, _action, _dispatch) {},
}),
"addTrigger": local({
description: "",
input: ph.input("AddTriggerInput", { fields: {
"trigger": ph.ref(() => TriggerInput, { required: true })
} }),
template: "",
reducerTemplate: "",
reduceLegacy(_state, _action, _dispatch) {},
}),
"removeTrigger": local({
description: "",
input: ph.input("RemoveTriggerInput", { fields: {
"triggerId": ph.String({ required: true })
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
            "name": {
              "kind": "Name",
              "value": "FolderNode"
            },
            "interfaces": [],
            "directives": [],
            "fields": [
              {
                "kind": "FieldDefinition",
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
                      "value": "String"
                    }
                  }
                },
                "directives": []
              },
              {
                "kind": "FieldDefinition",
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
                "name": {
                  "kind": "Name",
                  "value": "kind"
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
                "name": {
                  "kind": "Name",
                  "value": "parentFolder"
                },
                "arguments": [],
                "type": {
                  "kind": "NamedType",
                  "name": {
                    "kind": "Name",
                    "value": "String"
                  }
                },
                "directives": []
              }
            ]
          },
          {
            "kind": "ObjectTypeDefinition",
            "name": {
              "kind": "Name",
              "value": "FileNode"
            },
            "interfaces": [],
            "directives": [],
            "fields": [
              {
                "kind": "FieldDefinition",
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
                      "value": "String"
                    }
                  }
                },
                "directives": []
              },
              {
                "kind": "FieldDefinition",
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
                "name": {
                  "kind": "Name",
                  "value": "kind"
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
              },
              {
                "kind": "FieldDefinition",
                "name": {
                  "kind": "Name",
                  "value": "parentFolder"
                },
                "arguments": [],
                "type": {
                  "kind": "NamedType",
                  "name": {
                    "kind": "Name",
                    "value": "String"
                  }
                },
                "directives": []
              }
            ]
          },
          {
            "kind": "UnionTypeDefinition",
            "name": {
              "kind": "Name",
              "value": "Node"
            },
            "directives": [],
            "types": [
              {
                "kind": "NamedType",
                "name": {
                  "kind": "Name",
                  "value": "FolderNode"
                }
              },
              {
                "kind": "NamedType",
                "name": {
                  "kind": "Name",
                  "value": "FileNode"
                }
              }
            ]
          },
          {
            "kind": "ObjectTypeDefinition",
            "name": {
              "kind": "Name",
              "value": "DocumentDriveState"
            },
            "interfaces": [],
            "directives": [],
            "fields": [
              {
                "kind": "FieldDefinition",
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
                "name": {
                  "kind": "Name",
                  "value": "nodes"
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
                          "value": "Node"
                        }
                      }
                    }
                  }
                },
                "directives": [
                  {
                    "kind": "Directive",
                    "name": {
                      "kind": "Name",
                      "value": "deprecated"
                    },
                    "arguments": [
                      {
                        "kind": "Argument",
                        "name": {
                          "kind": "Name",
                          "value": "reason"
                        },
                        "value": {
                          "kind": "StringValue",
                          "value": "Use the reactor-drive subgraph (`reactorDrive.rootNodes`, `ReactorDriveFolderNode.children`) for paged listings.",
                          "block": false
                        }
                      }
                    ]
                  }
                ]
              },
              {
                "kind": "FieldDefinition",
                "name": {
                  "kind": "Name",
                  "value": "icon"
                },
                "arguments": [],
                "type": {
                  "kind": "NamedType",
                  "name": {
                    "kind": "Name",
                    "value": "String"
                  }
                },
                "directives": []
              }
            ]
          },
          {
            "kind": "ObjectTypeDefinition",
            "name": {
              "kind": "Name",
              "value": "ListenerFilter"
            },
            "interfaces": [],
            "directives": [],
            "fields": [
              {
                "kind": "FieldDefinition",
                "name": {
                  "kind": "Name",
                  "value": "documentType"
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
                "name": {
                  "kind": "Name",
                  "value": "documentId"
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
                        "value": "ID"
                      }
                    }
                  }
                },
                "directives": []
              },
              {
                "kind": "FieldDefinition",
                "name": {
                  "kind": "Name",
                  "value": "scope"
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
                "name": {
                  "kind": "Name",
                  "value": "branch"
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
              }
            ]
          },
          {
            "kind": "EnumTypeDefinition",
            "name": {
              "kind": "Name",
              "value": "TransmitterType"
            },
            "directives": [],
            "values": [
              {
                "kind": "EnumValueDefinition",
                "name": {
                  "kind": "Name",
                  "value": "Internal"
                },
                "directives": []
              },
              {
                "kind": "EnumValueDefinition",
                "name": {
                  "kind": "Name",
                  "value": "SwitchboardPush"
                },
                "directives": []
              },
              {
                "kind": "EnumValueDefinition",
                "name": {
                  "kind": "Name",
                  "value": "PullResponder"
                },
                "directives": []
              },
              {
                "kind": "EnumValueDefinition",
                "name": {
                  "kind": "Name",
                  "value": "SecureConnect"
                },
                "directives": []
              },
              {
                "kind": "EnumValueDefinition",
                "name": {
                  "kind": "Name",
                  "value": "MatrixConnect"
                },
                "directives": []
              },
              {
                "kind": "EnumValueDefinition",
                "name": {
                  "kind": "Name",
                  "value": "RESTWebhook"
                },
                "directives": []
              }
            ]
          },
          {
            "kind": "ObjectTypeDefinition",
            "name": {
              "kind": "Name",
              "value": "ListenerCallInfo"
            },
            "interfaces": [],
            "directives": [],
            "fields": [
              {
                "kind": "FieldDefinition",
                "name": {
                  "kind": "Name",
                  "value": "transmitterType"
                },
                "arguments": [],
                "type": {
                  "kind": "NamedType",
                  "name": {
                    "kind": "Name",
                    "value": "TransmitterType"
                  }
                },
                "directives": []
              },
              {
                "kind": "FieldDefinition",
                "name": {
                  "kind": "Name",
                  "value": "name"
                },
                "arguments": [],
                "type": {
                  "kind": "NamedType",
                  "name": {
                    "kind": "Name",
                    "value": "String"
                  }
                },
                "directives": []
              },
              {
                "kind": "FieldDefinition",
                "name": {
                  "kind": "Name",
                  "value": "data"
                },
                "arguments": [],
                "type": {
                  "kind": "NamedType",
                  "name": {
                    "kind": "Name",
                    "value": "String"
                  }
                },
                "directives": []
              }
            ]
          },
          {
            "kind": "ObjectTypeDefinition",
            "name": {
              "kind": "Name",
              "value": "Listener"
            },
            "interfaces": [],
            "directives": [],
            "fields": [
              {
                "kind": "FieldDefinition",
                "name": {
                  "kind": "Name",
                  "value": "listenerId"
                },
                "arguments": [],
                "type": {
                  "kind": "NonNullType",
                  "type": {
                    "kind": "NamedType",
                    "name": {
                      "kind": "Name",
                      "value": "ID"
                    }
                  }
                },
                "directives": []
              },
              {
                "kind": "FieldDefinition",
                "name": {
                  "kind": "Name",
                  "value": "label"
                },
                "arguments": [],
                "type": {
                  "kind": "NamedType",
                  "name": {
                    "kind": "Name",
                    "value": "String"
                  }
                },
                "directives": []
              },
              {
                "kind": "FieldDefinition",
                "name": {
                  "kind": "Name",
                  "value": "block"
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
              },
              {
                "kind": "FieldDefinition",
                "name": {
                  "kind": "Name",
                  "value": "system"
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
              },
              {
                "kind": "FieldDefinition",
                "name": {
                  "kind": "Name",
                  "value": "filter"
                },
                "arguments": [],
                "type": {
                  "kind": "NonNullType",
                  "type": {
                    "kind": "NamedType",
                    "name": {
                      "kind": "Name",
                      "value": "ListenerFilter"
                    }
                  }
                },
                "directives": []
              },
              {
                "kind": "FieldDefinition",
                "name": {
                  "kind": "Name",
                  "value": "callInfo"
                },
                "arguments": [],
                "type": {
                  "kind": "NamedType",
                  "name": {
                    "kind": "Name",
                    "value": "ListenerCallInfo"
                  }
                },
                "directives": []
              }
            ]
          },
          {
            "kind": "EnumTypeDefinition",
            "name": {
              "kind": "Name",
              "value": "TriggerType"
            },
            "directives": [],
            "values": [
              {
                "kind": "EnumValueDefinition",
                "name": {
                  "kind": "Name",
                  "value": "PullResponder"
                },
                "directives": []
              }
            ]
          },
          {
            "kind": "ObjectTypeDefinition",
            "name": {
              "kind": "Name",
              "value": "PullResponderTriggerData"
            },
            "interfaces": [],
            "directives": [],
            "fields": [
              {
                "kind": "FieldDefinition",
                "name": {
                  "kind": "Name",
                  "value": "listenerId"
                },
                "arguments": [],
                "type": {
                  "kind": "NonNullType",
                  "type": {
                    "kind": "NamedType",
                    "name": {
                      "kind": "Name",
                      "value": "ID"
                    }
                  }
                },
                "directives": []
              },
              {
                "kind": "FieldDefinition",
                "name": {
                  "kind": "Name",
                  "value": "url"
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
                "name": {
                  "kind": "Name",
                  "value": "interval"
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
            "kind": "UnionTypeDefinition",
            "name": {
              "kind": "Name",
              "value": "TriggerData"
            },
            "directives": [],
            "types": [
              {
                "kind": "NamedType",
                "name": {
                  "kind": "Name",
                  "value": "PullResponderTriggerData"
                }
              }
            ]
          },
          {
            "kind": "ObjectTypeDefinition",
            "name": {
              "kind": "Name",
              "value": "Trigger"
            },
            "interfaces": [],
            "directives": [],
            "fields": [
              {
                "kind": "FieldDefinition",
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
                      "value": "ID"
                    }
                  }
                },
                "directives": []
              },
              {
                "kind": "FieldDefinition",
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
                      "value": "TriggerType"
                    }
                  }
                },
                "directives": []
              },
              {
                "kind": "FieldDefinition",
                "name": {
                  "kind": "Name",
                  "value": "data"
                },
                "arguments": [],
                "type": {
                  "kind": "NamedType",
                  "name": {
                    "kind": "Name",
                    "value": "TriggerData"
                  }
                },
                "directives": []
              }
            ]
          },
          {
            "kind": "ObjectTypeDefinition",
            "name": {
              "kind": "Name",
              "value": "DocumentDriveLocalState"
            },
            "interfaces": [],
            "directives": [],
            "fields": [
              {
                "kind": "FieldDefinition",
                "name": {
                  "kind": "Name",
                  "value": "sharingType"
                },
                "arguments": [],
                "type": {
                  "kind": "NamedType",
                  "name": {
                    "kind": "Name",
                    "value": "String"
                  }
                },
                "directives": []
              },
              {
                "kind": "FieldDefinition",
                "name": {
                  "kind": "Name",
                  "value": "listeners"
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
                          "value": "Listener"
                        }
                      }
                    }
                  }
                },
                "directives": []
              },
              {
                "kind": "FieldDefinition",
                "name": {
                  "kind": "Name",
                  "value": "triggers"
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
                          "value": "Trigger"
                        }
                      }
                    }
                  }
                },
                "directives": []
              },
              {
                "kind": "FieldDefinition",
                "name": {
                  "kind": "Name",
                  "value": "availableOffline"
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
            "kind": "InputObjectTypeDefinition",
            "name": {
              "kind": "Name",
              "value": "AddFileInput"
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
                      "value": "ID"
                    }
                  }
                },
                "directives": []
              },
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
              },
              {
                "kind": "InputValueDefinition",
                "name": {
                  "kind": "Name",
                  "value": "parentFolder"
                },
                "type": {
                  "kind": "NamedType",
                  "name": {
                    "kind": "Name",
                    "value": "ID"
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
              "value": "AddFolderInput"
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
                      "value": "ID"
                    }
                  }
                },
                "directives": []
              },
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
              },
              {
                "kind": "InputValueDefinition",
                "name": {
                  "kind": "Name",
                  "value": "parentFolder"
                },
                "type": {
                  "kind": "NamedType",
                  "name": {
                    "kind": "Name",
                    "value": "ID"
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
              "value": "DeleteNodeInput"
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
                      "value": "ID"
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
              "value": "UpdateFileInput"
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
                      "value": "ID"
                    }
                  }
                },
                "directives": []
              },
              {
                "kind": "InputValueDefinition",
                "name": {
                  "kind": "Name",
                  "value": "parentFolder"
                },
                "type": {
                  "kind": "NamedType",
                  "name": {
                    "kind": "Name",
                    "value": "ID"
                  }
                },
                "directives": []
              },
              {
                "kind": "InputValueDefinition",
                "name": {
                  "kind": "Name",
                  "value": "name"
                },
                "type": {
                  "kind": "NamedType",
                  "name": {
                    "kind": "Name",
                    "value": "String"
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
                  "kind": "NamedType",
                  "name": {
                    "kind": "Name",
                    "value": "String"
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
              "value": "UpdateNodeInput"
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
                      "value": "ID"
                    }
                  }
                },
                "directives": []
              },
              {
                "kind": "InputValueDefinition",
                "name": {
                  "kind": "Name",
                  "value": "parentFolder"
                },
                "type": {
                  "kind": "NamedType",
                  "name": {
                    "kind": "Name",
                    "value": "ID"
                  }
                },
                "directives": []
              },
              {
                "kind": "InputValueDefinition",
                "name": {
                  "kind": "Name",
                  "value": "name"
                },
                "type": {
                  "kind": "NamedType",
                  "name": {
                    "kind": "Name",
                    "value": "String"
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
              "value": "CopyNodeInput"
            },
            "directives": [],
            "fields": [
              {
                "kind": "InputValueDefinition",
                "name": {
                  "kind": "Name",
                  "value": "srcId"
                },
                "type": {
                  "kind": "NonNullType",
                  "type": {
                    "kind": "NamedType",
                    "name": {
                      "kind": "Name",
                      "value": "ID"
                    }
                  }
                },
                "directives": []
              },
              {
                "kind": "InputValueDefinition",
                "name": {
                  "kind": "Name",
                  "value": "targetId"
                },
                "type": {
                  "kind": "NonNullType",
                  "type": {
                    "kind": "NamedType",
                    "name": {
                      "kind": "Name",
                      "value": "ID"
                    }
                  }
                },
                "directives": []
              },
              {
                "kind": "InputValueDefinition",
                "name": {
                  "kind": "Name",
                  "value": "targetName"
                },
                "type": {
                  "kind": "NamedType",
                  "name": {
                    "kind": "Name",
                    "value": "String"
                  }
                },
                "directives": []
              },
              {
                "kind": "InputValueDefinition",
                "name": {
                  "kind": "Name",
                  "value": "targetParentFolder"
                },
                "type": {
                  "kind": "NamedType",
                  "name": {
                    "kind": "Name",
                    "value": "ID"
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
              "value": "MoveNodeInput"
            },
            "directives": [],
            "fields": [
              {
                "kind": "InputValueDefinition",
                "name": {
                  "kind": "Name",
                  "value": "srcFolder"
                },
                "type": {
                  "kind": "NonNullType",
                  "type": {
                    "kind": "NamedType",
                    "name": {
                      "kind": "Name",
                      "value": "ID"
                    }
                  }
                },
                "directives": []
              },
              {
                "kind": "InputValueDefinition",
                "name": {
                  "kind": "Name",
                  "value": "targetParentFolder"
                },
                "type": {
                  "kind": "NamedType",
                  "name": {
                    "kind": "Name",
                    "value": "ID"
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
              "value": "SetDriveNameInput"
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
              "value": "SetDriveIconInput"
            },
            "directives": [],
            "fields": [
              {
                "kind": "InputValueDefinition",
                "name": {
                  "kind": "Name",
                  "value": "icon"
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
              "value": "SetSharingTypeInput"
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
              "value": "SetAvailableOfflineInput"
            },
            "directives": [],
            "fields": [
              {
                "kind": "InputValueDefinition",
                "name": {
                  "kind": "Name",
                  "value": "availableOffline"
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
          },
          {
            "kind": "InputObjectTypeDefinition",
            "name": {
              "kind": "Name",
              "value": "ListenerFilterInput"
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
                "kind": "InputValueDefinition",
                "name": {
                  "kind": "Name",
                  "value": "documentId"
                },
                "type": {
                  "kind": "ListType",
                  "type": {
                    "kind": "NonNullType",
                    "type": {
                      "kind": "NamedType",
                      "name": {
                        "kind": "Name",
                        "value": "ID"
                      }
                    }
                  }
                },
                "directives": []
              },
              {
                "kind": "InputValueDefinition",
                "name": {
                  "kind": "Name",
                  "value": "scope"
                },
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
                "kind": "InputValueDefinition",
                "name": {
                  "kind": "Name",
                  "value": "branch"
                },
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
              }
            ]
          },
          {
            "kind": "InputObjectTypeDefinition",
            "name": {
              "kind": "Name",
              "value": "ListenerCallInfoInput"
            },
            "directives": [],
            "fields": [
              {
                "kind": "InputValueDefinition",
                "name": {
                  "kind": "Name",
                  "value": "transmitterType"
                },
                "type": {
                  "kind": "NamedType",
                  "name": {
                    "kind": "Name",
                    "value": "TransmitterType"
                  }
                },
                "directives": []
              },
              {
                "kind": "InputValueDefinition",
                "name": {
                  "kind": "Name",
                  "value": "name"
                },
                "type": {
                  "kind": "NamedType",
                  "name": {
                    "kind": "Name",
                    "value": "String"
                  }
                },
                "directives": []
              },
              {
                "kind": "InputValueDefinition",
                "name": {
                  "kind": "Name",
                  "value": "data"
                },
                "type": {
                  "kind": "NamedType",
                  "name": {
                    "kind": "Name",
                    "value": "String"
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
              "value": "ListenerInput"
            },
            "directives": [],
            "fields": [
              {
                "kind": "InputValueDefinition",
                "name": {
                  "kind": "Name",
                  "value": "listenerId"
                },
                "type": {
                  "kind": "NonNullType",
                  "type": {
                    "kind": "NamedType",
                    "name": {
                      "kind": "Name",
                      "value": "ID"
                    }
                  }
                },
                "directives": []
              },
              {
                "kind": "InputValueDefinition",
                "name": {
                  "kind": "Name",
                  "value": "label"
                },
                "type": {
                  "kind": "NamedType",
                  "name": {
                    "kind": "Name",
                    "value": "String"
                  }
                },
                "directives": []
              },
              {
                "kind": "InputValueDefinition",
                "name": {
                  "kind": "Name",
                  "value": "block"
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
              },
              {
                "kind": "InputValueDefinition",
                "name": {
                  "kind": "Name",
                  "value": "system"
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
              },
              {
                "kind": "InputValueDefinition",
                "name": {
                  "kind": "Name",
                  "value": "filter"
                },
                "type": {
                  "kind": "NonNullType",
                  "type": {
                    "kind": "NamedType",
                    "name": {
                      "kind": "Name",
                      "value": "ListenerFilterInput"
                    }
                  }
                },
                "directives": []
              },
              {
                "kind": "InputValueDefinition",
                "name": {
                  "kind": "Name",
                  "value": "callInfo"
                },
                "type": {
                  "kind": "NamedType",
                  "name": {
                    "kind": "Name",
                    "value": "ListenerCallInfoInput"
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
              "value": "AddListenerInput"
            },
            "directives": [],
            "fields": [
              {
                "kind": "InputValueDefinition",
                "name": {
                  "kind": "Name",
                  "value": "listener"
                },
                "type": {
                  "kind": "NonNullType",
                  "type": {
                    "kind": "NamedType",
                    "name": {
                      "kind": "Name",
                      "value": "ListenerInput"
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
              "value": "RemoveListenerInput"
            },
            "directives": [],
            "fields": [
              {
                "kind": "InputValueDefinition",
                "name": {
                  "kind": "Name",
                  "value": "listenerId"
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
              "value": "PullResponderTriggerDataInput"
            },
            "directives": [],
            "fields": [
              {
                "kind": "InputValueDefinition",
                "name": {
                  "kind": "Name",
                  "value": "listenerId"
                },
                "type": {
                  "kind": "NonNullType",
                  "type": {
                    "kind": "NamedType",
                    "name": {
                      "kind": "Name",
                      "value": "ID"
                    }
                  }
                },
                "directives": []
              },
              {
                "kind": "InputValueDefinition",
                "name": {
                  "kind": "Name",
                  "value": "url"
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
              },
              {
                "kind": "InputValueDefinition",
                "name": {
                  "kind": "Name",
                  "value": "interval"
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
              "value": "TriggerInput"
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
                      "value": "ID"
                    }
                  }
                },
                "directives": []
              },
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
                      "value": "TriggerType"
                    }
                  }
                },
                "directives": []
              },
              {
                "kind": "InputValueDefinition",
                "name": {
                  "kind": "Name",
                  "value": "data"
                },
                "type": {
                  "kind": "NamedType",
                  "name": {
                    "kind": "Name",
                    "value": "PullResponderTriggerDataInput"
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
              "value": "AddTriggerInput"
            },
            "directives": [],
            "fields": [
              {
                "kind": "InputValueDefinition",
                "name": {
                  "kind": "Name",
                  "value": "trigger"
                },
                "type": {
                  "kind": "NonNullType",
                  "type": {
                    "kind": "NamedType",
                    "name": {
                      "kind": "Name",
                      "value": "TriggerInput"
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
              "value": "RemoveTriggerInput"
            },
            "directives": [],
            "fields": [
              {
                "kind": "InputValueDefinition",
                "name": {
                  "kind": "Name",
                  "value": "triggerId"
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
        "name": "FolderNode",
        "description": null,
        "fields": [
          {
            "key": "id",
            "name": "id",
            "description": null,
            "deprecated": null,
            "type": {
              "kind": "scalar",
              "name": "String",
              "required": true
            }
          },
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
          },
          {
            "key": "kind",
            "name": "kind",
            "description": null,
            "deprecated": null,
            "type": {
              "kind": "scalar",
              "name": "String",
              "required": true
            }
          },
          {
            "key": "parentFolder",
            "name": "parentFolder",
            "description": null,
            "deprecated": null,
            "type": {
              "kind": "scalar",
              "name": "String",
              "required": false
            }
          }
        ]
      },
      {
        "kind": "object",
        "name": "FileNode",
        "description": null,
        "fields": [
          {
            "key": "id",
            "name": "id",
            "description": null,
            "deprecated": null,
            "type": {
              "kind": "scalar",
              "name": "String",
              "required": true
            }
          },
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
          },
          {
            "key": "kind",
            "name": "kind",
            "description": null,
            "deprecated": null,
            "type": {
              "kind": "scalar",
              "name": "String",
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
          },
          {
            "key": "parentFolder",
            "name": "parentFolder",
            "description": null,
            "deprecated": null,
            "type": {
              "kind": "scalar",
              "name": "String",
              "required": false
            }
          }
        ]
      },
      {
        "kind": "union",
        "name": "Node",
        "description": null,
        "members": [
          "FolderNode",
          "FileNode"
        ]
      },
      {
        "kind": "object",
        "name": "DocumentDriveState",
        "description": null,
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
          },
          {
            "key": "nodes",
            "name": "nodes",
            "description": null,
            "deprecated": "Use the reactor-drive subgraph (`reactorDrive.rootNodes`, `ReactorDriveFolderNode.children`) for paged listings.",
            "type": {
              "kind": "list",
              "required": true,
              "item": {
                "kind": "named",
                "name": "Node",
                "required": true
              }
            }
          },
          {
            "key": "icon",
            "name": "icon",
            "description": null,
            "deprecated": null,
            "type": {
              "kind": "scalar",
              "name": "String",
              "required": false
            }
          }
        ]
      },
      {
        "kind": "object",
        "name": "ListenerFilter",
        "description": null,
        "fields": [
          {
            "key": "documentType",
            "name": "documentType",
            "description": null,
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
            "key": "documentId",
            "name": "documentId",
            "description": null,
            "deprecated": null,
            "type": {
              "kind": "list",
              "required": false,
              "item": {
                "kind": "scalar",
                "name": "ID",
                "required": true
              }
            }
          },
          {
            "key": "scope",
            "name": "scope",
            "description": null,
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
            "key": "branch",
            "name": "branch",
            "description": null,
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
          }
        ]
      },
      {
        "kind": "enum",
        "name": "TransmitterType",
        "description": null,
        "values": [
          {
            "name": "Internal",
            "description": null,
            "deprecated": null
          },
          {
            "name": "SwitchboardPush",
            "description": null,
            "deprecated": null
          },
          {
            "name": "PullResponder",
            "description": null,
            "deprecated": null
          },
          {
            "name": "SecureConnect",
            "description": null,
            "deprecated": null
          },
          {
            "name": "MatrixConnect",
            "description": null,
            "deprecated": null
          },
          {
            "name": "RESTWebhook",
            "description": null,
            "deprecated": null
          }
        ]
      },
      {
        "kind": "object",
        "name": "ListenerCallInfo",
        "description": null,
        "fields": [
          {
            "key": "transmitterType",
            "name": "transmitterType",
            "description": null,
            "deprecated": null,
            "type": {
              "kind": "named",
              "name": "TransmitterType",
              "required": false
            }
          },
          {
            "key": "name",
            "name": "name",
            "description": null,
            "deprecated": null,
            "type": {
              "kind": "scalar",
              "name": "String",
              "required": false
            }
          },
          {
            "key": "data",
            "name": "data",
            "description": null,
            "deprecated": null,
            "type": {
              "kind": "scalar",
              "name": "String",
              "required": false
            }
          }
        ]
      },
      {
        "kind": "object",
        "name": "Listener",
        "description": null,
        "fields": [
          {
            "key": "listenerId",
            "name": "listenerId",
            "description": null,
            "deprecated": null,
            "type": {
              "kind": "scalar",
              "name": "ID",
              "required": true
            }
          },
          {
            "key": "label",
            "name": "label",
            "description": null,
            "deprecated": null,
            "type": {
              "kind": "scalar",
              "name": "String",
              "required": false
            }
          },
          {
            "key": "block",
            "name": "block",
            "description": null,
            "deprecated": null,
            "type": {
              "kind": "scalar",
              "name": "Boolean",
              "required": true
            }
          },
          {
            "key": "system",
            "name": "system",
            "description": null,
            "deprecated": null,
            "type": {
              "kind": "scalar",
              "name": "Boolean",
              "required": true
            }
          },
          {
            "key": "filter",
            "name": "filter",
            "description": null,
            "deprecated": null,
            "type": {
              "kind": "named",
              "name": "ListenerFilter",
              "required": true
            }
          },
          {
            "key": "callInfo",
            "name": "callInfo",
            "description": null,
            "deprecated": null,
            "type": {
              "kind": "named",
              "name": "ListenerCallInfo",
              "required": false
            }
          }
        ]
      },
      {
        "kind": "enum",
        "name": "TriggerType",
        "description": null,
        "values": [
          {
            "name": "PullResponder",
            "description": null,
            "deprecated": null
          }
        ]
      },
      {
        "kind": "object",
        "name": "PullResponderTriggerData",
        "description": null,
        "fields": [
          {
            "key": "listenerId",
            "name": "listenerId",
            "description": null,
            "deprecated": null,
            "type": {
              "kind": "scalar",
              "name": "ID",
              "required": true
            }
          },
          {
            "key": "url",
            "name": "url",
            "description": null,
            "deprecated": null,
            "type": {
              "kind": "scalar",
              "name": "String",
              "required": true
            }
          },
          {
            "key": "interval",
            "name": "interval",
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
      {
        "kind": "union",
        "name": "TriggerData",
        "description": null,
        "members": [
          "PullResponderTriggerData"
        ]
      },
      {
        "kind": "object",
        "name": "Trigger",
        "description": null,
        "fields": [
          {
            "key": "id",
            "name": "id",
            "description": null,
            "deprecated": null,
            "type": {
              "kind": "scalar",
              "name": "ID",
              "required": true
            }
          },
          {
            "key": "type",
            "name": "type",
            "description": null,
            "deprecated": null,
            "type": {
              "kind": "named",
              "name": "TriggerType",
              "required": true
            }
          },
          {
            "key": "data",
            "name": "data",
            "description": null,
            "deprecated": null,
            "type": {
              "kind": "named",
              "name": "TriggerData",
              "required": false
            }
          }
        ]
      },
      {
        "kind": "object",
        "name": "DocumentDriveLocalState",
        "description": null,
        "fields": [
          {
            "key": "sharingType",
            "name": "sharingType",
            "description": null,
            "deprecated": null,
            "type": {
              "kind": "scalar",
              "name": "String",
              "required": false
            }
          },
          {
            "key": "listeners",
            "name": "listeners",
            "description": null,
            "deprecated": null,
            "type": {
              "kind": "list",
              "required": true,
              "item": {
                "kind": "named",
                "name": "Listener",
                "required": true
              }
            }
          },
          {
            "key": "triggers",
            "name": "triggers",
            "description": null,
            "deprecated": null,
            "type": {
              "kind": "list",
              "required": true,
              "item": {
                "kind": "named",
                "name": "Trigger",
                "required": true
              }
            }
          },
          {
            "key": "availableOffline",
            "name": "availableOffline",
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
      {
        "kind": "input",
        "name": "ListenerFilterInput",
        "description": null,
        "unknownKeys": "preserve",
        "fields": [
          {
            "key": "documentType",
            "name": "documentType",
            "description": null,
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
            "key": "documentId",
            "name": "documentId",
            "description": null,
            "deprecated": null,
            "type": {
              "kind": "list",
              "required": false,
              "item": {
                "kind": "scalar",
                "name": "ID",
                "required": true
              }
            }
          },
          {
            "key": "scope",
            "name": "scope",
            "description": null,
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
            "key": "branch",
            "name": "branch",
            "description": null,
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
          }
        ]
      },
      {
        "kind": "input",
        "name": "ListenerCallInfoInput",
        "description": null,
        "unknownKeys": "preserve",
        "fields": [
          {
            "key": "transmitterType",
            "name": "transmitterType",
            "description": null,
            "deprecated": null,
            "type": {
              "kind": "named",
              "name": "TransmitterType",
              "required": false
            }
          },
          {
            "key": "name",
            "name": "name",
            "description": null,
            "deprecated": null,
            "type": {
              "kind": "scalar",
              "name": "String",
              "required": false
            }
          },
          {
            "key": "data",
            "name": "data",
            "description": null,
            "deprecated": null,
            "type": {
              "kind": "scalar",
              "name": "String",
              "required": false
            }
          }
        ]
      },
      {
        "kind": "input",
        "name": "ListenerInput",
        "description": null,
        "unknownKeys": "preserve",
        "fields": [
          {
            "key": "listenerId",
            "name": "listenerId",
            "description": null,
            "deprecated": null,
            "type": {
              "kind": "scalar",
              "name": "ID",
              "required": true
            }
          },
          {
            "key": "label",
            "name": "label",
            "description": null,
            "deprecated": null,
            "type": {
              "kind": "scalar",
              "name": "String",
              "required": false
            }
          },
          {
            "key": "block",
            "name": "block",
            "description": null,
            "deprecated": null,
            "type": {
              "kind": "scalar",
              "name": "Boolean",
              "required": true
            }
          },
          {
            "key": "system",
            "name": "system",
            "description": null,
            "deprecated": null,
            "type": {
              "kind": "scalar",
              "name": "Boolean",
              "required": true
            }
          },
          {
            "key": "filter",
            "name": "filter",
            "description": null,
            "deprecated": null,
            "type": {
              "kind": "named",
              "name": "ListenerFilterInput",
              "required": true
            }
          },
          {
            "key": "callInfo",
            "name": "callInfo",
            "description": null,
            "deprecated": null,
            "type": {
              "kind": "named",
              "name": "ListenerCallInfoInput",
              "required": false
            }
          }
        ]
      },
      {
        "kind": "input",
        "name": "PullResponderTriggerDataInput",
        "description": null,
        "unknownKeys": "preserve",
        "fields": [
          {
            "key": "listenerId",
            "name": "listenerId",
            "description": null,
            "deprecated": null,
            "type": {
              "kind": "scalar",
              "name": "ID",
              "required": true
            }
          },
          {
            "key": "url",
            "name": "url",
            "description": null,
            "deprecated": null,
            "type": {
              "kind": "scalar",
              "name": "String",
              "required": true
            }
          },
          {
            "key": "interval",
            "name": "interval",
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
      {
        "kind": "input",
        "name": "TriggerInput",
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
              "name": "ID",
              "required": true
            }
          },
          {
            "key": "type",
            "name": "type",
            "description": null,
            "deprecated": null,
            "type": {
              "kind": "named",
              "name": "TriggerType",
              "required": true
            }
          },
          {
            "key": "data",
            "name": "data",
            "description": null,
            "deprecated": null,
            "type": {
              "kind": "named",
              "name": "PullResponderTriggerDataInput",
              "required": false
            }
          }
        ]
      }
    ],
    "state": {
      "global": {
        "root": {
          "kind": "named",
          "name": "DocumentDriveState",
          "required": true
        },
        "initialValue": {
          "name": "",
          "nodes": [],
          "icon": null
        },
        "examples": [],
        "unknownKeys": "preserve",
        "materialized": {
          "schema": "type FolderNode {\n    id: String!\n    name: String!\n    kind: String!\n    parentFolder: String\n}\n\ntype FileNode {\n    id: String!\n    name: String!\n    kind: String!\n    documentType: String!\n    parentFolder: String\n}\n\nunion Node = FolderNode | FileNode\n\ntype DocumentDriveState {\n    name: String!\n    nodes: [Node!]! @deprecated(reason: \"Use the reactor-drive subgraph (`reactorDrive.rootNodes`, `ReactorDriveFolderNode.children`) for paged listings.\")\n    icon: String\n}",
          "initialValue": "{\"name\":\"\",\"nodes\":[],\"icon\":null}",
          "examples": []
        }
      },
      "local": {
        "root": {
          "kind": "named",
          "name": "DocumentDriveLocalState",
          "required": true
        },
        "initialValue": {
          "listeners": [],
          "triggers": [],
          "sharingType": "private",
          "availableOffline": false
        },
        "examples": [],
        "unknownKeys": "preserve",
        "materialized": {
          "schema": "type ListenerFilter {\n    documentType: [String!]\n    documentId: [ID!]\n    scope: [String!]\n    branch: [String!]\n}\n\nenum TransmitterType {\n    Internal,\n    SwitchboardPush,\n    PullResponder,\n    SecureConnect, \n    MatrixConnect,\n    RESTWebhook\n}\n\ntype ListenerCallInfo {\n    transmitterType: TransmitterType\n    name: String\n    data: String\n}\n\ntype Listener {\n    listenerId: ID!\n    label: String\n    block: Boolean!\n    system: Boolean!\n    filter: ListenerFilter!\n    callInfo: ListenerCallInfo\n}\n\nenum TriggerType {\n    PullResponder\n}\n\ntype PullResponderTriggerData {\n    listenerId: ID!\n    url: String!\n    interval: String!\n}\n\nunion TriggerData = PullResponderTriggerData\n\ntype Trigger {\n    id: ID!\n    type: TriggerType!\n    data: TriggerData\n}\n\ntype DocumentDriveLocalState{\n    sharingType: String\n    listeners: [Listener!]!\n    triggers: [Trigger!]!\n    availableOffline: Boolean!\n}",
          "initialValue": "{ \"listeners\": [], \"triggers\": [], \"sharingType\": \"private\", \"availableOffline\": false}",
          "examples": []
        }
      }
    },
    "modules": [
      {
        "id": "GRzuvv78tBvmB6ciitokLfonNHA=",
        "key": "Node",
        "name": "Node",
        "description": "",
        "operations": [
          {
            "id": "7xiTdxonc9yEASR8sfV/KnbSV10=",
            "key": "ADD_FILE",
            "name": "ADD_FILE",
            "description": "",
            "actionType": "ADD_FILE",
            "creatorKey": "addFile",
            "scope": "global",
            "input": {
              "kind": "input",
              "name": "AddFileInput",
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
                    "name": "ID",
                    "required": true
                  }
                },
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
                },
                {
                  "key": "parentFolder",
                  "name": "parentFolder",
                  "description": null,
                  "deprecated": null,
                  "type": {
                    "kind": "scalar",
                    "name": "ID",
                    "required": false
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
            "id": "4lzNMMKKdIAtEU6i12xLgi9hp+U=",
            "key": "ADD_FOLDER",
            "name": "ADD_FOLDER",
            "description": "",
            "actionType": "ADD_FOLDER",
            "creatorKey": "addFolder",
            "scope": "global",
            "input": {
              "kind": "input",
              "name": "AddFolderInput",
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
                    "name": "ID",
                    "required": true
                  }
                },
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
                },
                {
                  "key": "parentFolder",
                  "name": "parentFolder",
                  "description": null,
                  "deprecated": null,
                  "type": {
                    "kind": "scalar",
                    "name": "ID",
                    "required": false
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
            "id": "53jH2/3TWTTcgCJiv2C+BmuC6i0=",
            "key": "DELETE_NODE",
            "name": "DELETE_NODE",
            "description": "",
            "actionType": "DELETE_NODE",
            "creatorKey": "deleteNode",
            "scope": "global",
            "input": {
              "kind": "input",
              "name": "DeleteNodeInput",
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
                    "name": "ID",
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
            "id": "pNn+Y1/HVq/GNMk7t0u3g3gtMLE=",
            "key": "UPDATE_FILE",
            "name": "UPDATE_FILE",
            "description": "",
            "actionType": "UPDATE_FILE",
            "creatorKey": "updateFile",
            "scope": "global",
            "input": {
              "kind": "input",
              "name": "UpdateFileInput",
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
                    "name": "ID",
                    "required": true
                  }
                },
                {
                  "key": "parentFolder",
                  "name": "parentFolder",
                  "description": null,
                  "deprecated": null,
                  "type": {
                    "kind": "scalar",
                    "name": "ID",
                    "required": false
                  }
                },
                {
                  "key": "name",
                  "name": "name",
                  "description": null,
                  "deprecated": null,
                  "type": {
                    "kind": "scalar",
                    "name": "String",
                    "required": false
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
                    "required": false
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
            "id": "P0x1M8Mnt+Q/+9nggkwgVbfybsc=",
            "key": "UPDATE_NODE",
            "name": "UPDATE_NODE",
            "description": "",
            "actionType": "UPDATE_NODE",
            "creatorKey": "updateNode",
            "scope": "global",
            "input": {
              "kind": "input",
              "name": "UpdateNodeInput",
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
                    "name": "ID",
                    "required": true
                  }
                },
                {
                  "key": "parentFolder",
                  "name": "parentFolder",
                  "description": null,
                  "deprecated": null,
                  "type": {
                    "kind": "scalar",
                    "name": "ID",
                    "required": false
                  }
                },
                {
                  "key": "name",
                  "name": "name",
                  "description": null,
                  "deprecated": null,
                  "type": {
                    "kind": "scalar",
                    "name": "String",
                    "required": false
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
            "id": "vnQ7OB5b3wGLgjhbgJqAIpA+JLE=",
            "key": "COPY_NODE",
            "name": "COPY_NODE",
            "description": "",
            "actionType": "COPY_NODE",
            "creatorKey": "copyNode",
            "scope": "global",
            "input": {
              "kind": "input",
              "name": "CopyNodeInput",
              "description": null,
              "unknownKeys": "preserve",
              "fields": [
                {
                  "key": "srcId",
                  "name": "srcId",
                  "description": null,
                  "deprecated": null,
                  "type": {
                    "kind": "scalar",
                    "name": "ID",
                    "required": true
                  }
                },
                {
                  "key": "targetId",
                  "name": "targetId",
                  "description": null,
                  "deprecated": null,
                  "type": {
                    "kind": "scalar",
                    "name": "ID",
                    "required": true
                  }
                },
                {
                  "key": "targetName",
                  "name": "targetName",
                  "description": null,
                  "deprecated": null,
                  "type": {
                    "kind": "scalar",
                    "name": "String",
                    "required": false
                  }
                },
                {
                  "key": "targetParentFolder",
                  "name": "targetParentFolder",
                  "description": null,
                  "deprecated": null,
                  "type": {
                    "kind": "scalar",
                    "name": "ID",
                    "required": false
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
            "id": "VNyiD/sNGzk6k9A1Qe7s8dmrJxA=",
            "key": "MOVE_NODE",
            "name": "MOVE_NODE",
            "description": "",
            "actionType": "MOVE_NODE",
            "creatorKey": "moveNode",
            "scope": "global",
            "input": {
              "kind": "input",
              "name": "MoveNodeInput",
              "description": null,
              "unknownKeys": "preserve",
              "fields": [
                {
                  "key": "srcFolder",
                  "name": "srcFolder",
                  "description": null,
                  "deprecated": null,
                  "type": {
                    "kind": "scalar",
                    "name": "ID",
                    "required": true
                  }
                },
                {
                  "key": "targetParentFolder",
                  "name": "targetParentFolder",
                  "description": null,
                  "deprecated": null,
                  "type": {
                    "kind": "scalar",
                    "name": "ID",
                    "required": false
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
        "id": "0dHwHlxOM9x0vMZ+gLnKxf2qTEo=",
        "key": "Drive",
        "name": "Drive",
        "description": "",
        "operations": [
          {
            "id": "qGCiPGpTt/cyz3HzyrBn92z1dsU=",
            "key": "SET_DRIVE_NAME",
            "name": "SET_DRIVE_NAME",
            "description": "",
            "actionType": "SET_DRIVE_NAME",
            "creatorKey": "setDriveName",
            "scope": "global",
            "input": {
              "kind": "input",
              "name": "SetDriveNameInput",
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
            "id": "qGCiPGpTt/cyz3HzyrBn92z30dsU=",
            "key": "SET_DRIVE_ICON",
            "name": "SET_DRIVE_ICON",
            "description": "",
            "actionType": "SET_DRIVE_ICON",
            "creatorKey": "setDriveIcon",
            "scope": "global",
            "input": {
              "kind": "input",
              "name": "SetDriveIconInput",
              "description": null,
              "unknownKeys": "preserve",
              "fields": [
                {
                  "key": "icon",
                  "name": "icon",
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
            "id": "qGCiPGpTt/cyz3HzyrBn92z2dsU=",
            "key": "SET_SHARING_TYPE",
            "name": "SET_SHARING_TYPE",
            "description": "",
            "actionType": "SET_SHARING_TYPE",
            "creatorKey": "setSharingType",
            "scope": "local",
            "input": {
              "kind": "input",
              "name": "SetSharingTypeInput",
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
            "id": "qGCiPGpTt/cyz3HzyrBn92z3dsU=",
            "key": "SET_AVAILABLE_OFFLINE",
            "name": "SET_AVAILABLE_OFFLINE",
            "description": "",
            "actionType": "SET_AVAILABLE_OFFLINE",
            "creatorKey": "setAvailableOffline",
            "scope": "local",
            "input": {
              "kind": "input",
              "name": "SetAvailableOfflineInput",
              "description": null,
              "unknownKeys": "preserve",
              "fields": [
                {
                  "key": "availableOffline",
                  "name": "availableOffline",
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
          },
          {
            "id": "qGCiPGpTt/cyz3HzyrBn92z9dsU=",
            "key": "ADD_LISTENER",
            "name": "ADD_LISTENER",
            "description": "",
            "actionType": "ADD_LISTENER",
            "creatorKey": "addListener",
            "scope": "local",
            "input": {
              "kind": "input",
              "name": "AddListenerInput",
              "description": null,
              "unknownKeys": "preserve",
              "fields": [
                {
                  "key": "listener",
                  "name": "listener",
                  "description": null,
                  "deprecated": null,
                  "type": {
                    "kind": "named",
                    "name": "ListenerInput",
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
            "id": "qGCiPGpTt/cyz3HzyrBn92z10dsU=",
            "key": "REMOVE_LISTENER",
            "name": "REMOVE_LISTENER",
            "description": "",
            "actionType": "REMOVE_LISTENER",
            "creatorKey": "removeListener",
            "scope": "local",
            "input": {
              "kind": "input",
              "name": "RemoveListenerInput",
              "description": null,
              "unknownKeys": "preserve",
              "fields": [
                {
                  "key": "listenerId",
                  "name": "listenerId",
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
            "id": "qGCiPGpTt/cyz3HzyrBn92z20dsU=",
            "key": "ADD_TRIGGER",
            "name": "ADD_TRIGGER",
            "description": "",
            "actionType": "ADD_TRIGGER",
            "creatorKey": "addTrigger",
            "scope": "local",
            "input": {
              "kind": "input",
              "name": "AddTriggerInput",
              "description": null,
              "unknownKeys": "preserve",
              "fields": [
                {
                  "key": "trigger",
                  "name": "trigger",
                  "description": null,
                  "deprecated": null,
                  "type": {
                    "kind": "named",
                    "name": "TriggerInput",
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
            "id": "qGCiPGpTt/cyz3HzyrBn92z30dsU=",
            "key": "REMOVE_TRIGGER",
            "name": "REMOVE_TRIGGER",
            "description": "",
            "actionType": "REMOVE_TRIGGER",
            "creatorKey": "removeTrigger",
            "scope": "local",
            "input": {
              "kind": "input",
              "name": "RemoveTriggerInput",
              "description": null,
              "unknownKeys": "preserve",
              "fields": [
                {
                  "key": "triggerId",
                  "name": "triggerId",
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
          }
        ]
      }
    ],
    "changeLog": []
  },
  "materialized": {
    "version": 1,
    "changeLog": [],
    "state": {
      "global": {
        "schema": "type FolderNode {\n    id: String!\n    name: String!\n    kind: String!\n    parentFolder: String\n}\n\ntype FileNode {\n    id: String!\n    name: String!\n    kind: String!\n    documentType: String!\n    parentFolder: String\n}\n\nunion Node = FolderNode | FileNode\n\ntype DocumentDriveState {\n    name: String!\n    nodes: [Node!]! @deprecated(reason: \"Use the reactor-drive subgraph (`reactorDrive.rootNodes`, `ReactorDriveFolderNode.children`) for paged listings.\")\n    icon: String\n}",
        "initialValue": "{\"name\":\"\",\"nodes\":[],\"icon\":null}",
        "examples": []
      },
      "local": {
        "schema": "type ListenerFilter {\n    documentType: [String!]\n    documentId: [ID!]\n    scope: [String!]\n    branch: [String!]\n}\n\nenum TransmitterType {\n    Internal,\n    SwitchboardPush,\n    PullResponder,\n    SecureConnect, \n    MatrixConnect,\n    RESTWebhook\n}\n\ntype ListenerCallInfo {\n    transmitterType: TransmitterType\n    name: String\n    data: String\n}\n\ntype Listener {\n    listenerId: ID!\n    label: String\n    block: Boolean!\n    system: Boolean!\n    filter: ListenerFilter!\n    callInfo: ListenerCallInfo\n}\n\nenum TriggerType {\n    PullResponder\n}\n\ntype PullResponderTriggerData {\n    listenerId: ID!\n    url: String!\n    interval: String!\n}\n\nunion TriggerData = PullResponderTriggerData\n\ntype Trigger {\n    id: ID!\n    type: TriggerType!\n    data: TriggerData\n}\n\ntype DocumentDriveLocalState{\n    sharingType: String\n    listeners: [Listener!]!\n    triggers: [Trigger!]!\n    availableOffline: Boolean!\n}",
        "initialValue": "{ \"listeners\": [], \"triggers\": [], \"sharingType\": \"private\", \"availableOffline\": false}",
        "examples": []
      }
    },
    "modules": [
      {
        "id": "GRzuvv78tBvmB6ciitokLfonNHA=",
        "name": "Node",
        "description": "",
        "operations": [
          {
            "id": "7xiTdxonc9yEASR8sfV/KnbSV10=",
            "name": "ADD_FILE",
            "description": "",
            "schema": "input AddFileInput {\n    id: ID!\n    name: String!\n    documentType: String!\n    parentFolder: ID\n}",
            "template": "",
            "reducer": "",
            "errors": [],
            "examples": [],
            "scope": "global"
          },
          {
            "id": "4lzNMMKKdIAtEU6i12xLgi9hp+U=",
            "name": "ADD_FOLDER",
            "description": "",
            "schema": "input AddFolderInput {\n    id: ID!\n    name: String!\n    parentFolder: ID\n}",
            "template": "",
            "reducer": "",
            "errors": [],
            "examples": [],
            "scope": "global"
          },
          {
            "id": "53jH2/3TWTTcgCJiv2C+BmuC6i0=",
            "name": "DELETE_NODE",
            "description": "",
            "schema": "input DeleteNodeInput {\n    id: ID!\n}",
            "template": "",
            "reducer": "",
            "errors": [],
            "examples": [],
            "scope": "global"
          },
          {
            "id": "pNn+Y1/HVq/GNMk7t0u3g3gtMLE=",
            "name": "UPDATE_FILE",
            "description": "",
            "schema": "input UpdateFileInput {\n    id: ID!\n    parentFolder: ID\n    name: String\n    documentType: String\n}",
            "template": "",
            "reducer": "",
            "errors": [],
            "examples": [],
            "scope": "global"
          },
          {
            "id": "P0x1M8Mnt+Q/+9nggkwgVbfybsc=",
            "name": "UPDATE_NODE",
            "description": "",
            "schema": "input UpdateNodeInput {\n    id: ID!\n    parentFolder: ID\n    name: String\n}",
            "template": "",
            "reducer": "",
            "errors": [],
            "examples": [],
            "scope": "global"
          },
          {
            "id": "vnQ7OB5b3wGLgjhbgJqAIpA+JLE=",
            "name": "COPY_NODE",
            "description": "",
            "schema": "input CopyNodeInput {\n    srcId: ID!\n    targetId: ID!\n    targetName: String\n    targetParentFolder: ID\n}",
            "template": "",
            "reducer": "",
            "errors": [],
            "examples": [],
            "scope": "global"
          },
          {
            "id": "VNyiD/sNGzk6k9A1Qe7s8dmrJxA=",
            "name": "MOVE_NODE",
            "description": "",
            "schema": "input MoveNodeInput {\n    srcFolder: ID!\n    targetParentFolder: ID\n}",
            "template": "",
            "reducer": "",
            "errors": [],
            "examples": [],
            "scope": "global"
          }
        ]
      },
      {
        "id": "0dHwHlxOM9x0vMZ+gLnKxf2qTEo=",
        "name": "Drive",
        "description": "",
        "operations": [
          {
            "id": "qGCiPGpTt/cyz3HzyrBn92z1dsU=",
            "name": "SET_DRIVE_NAME",
            "description": "",
            "schema": "input SetDriveNameInput {\n    name: String!\n}",
            "template": "",
            "reducer": "",
            "errors": [],
            "examples": [],
            "scope": "global"
          },
          {
            "id": "qGCiPGpTt/cyz3HzyrBn92z30dsU=",
            "name": "SET_DRIVE_ICON",
            "description": "",
            "schema": "input SetDriveIconInput {\n    icon: String!\n}",
            "template": "",
            "reducer": "",
            "errors": [],
            "examples": [],
            "scope": "global"
          },
          {
            "id": "qGCiPGpTt/cyz3HzyrBn92z2dsU=",
            "name": "SET_SHARING_TYPE",
            "description": "",
            "schema": "input SetSharingTypeInput {\n    type: String!\n}",
            "template": "",
            "reducer": "",
            "errors": [],
            "examples": [],
            "scope": "local"
          },
          {
            "id": "qGCiPGpTt/cyz3HzyrBn92z3dsU=",
            "name": "SET_AVAILABLE_OFFLINE",
            "description": "",
            "schema": "input SetAvailableOfflineInput {\n    availableOffline: Boolean!\n}",
            "template": "",
            "reducer": "",
            "errors": [],
            "examples": [],
            "scope": "local"
          },
          {
            "id": "qGCiPGpTt/cyz3HzyrBn92z9dsU=",
            "name": "ADD_LISTENER",
            "description": "",
            "schema": "input ListenerFilterInput {\n    documentType: [String!]\n    documentId: [ID!]\n    scope: [String!]\n    branch: [String!]\n}\n\ninput ListenerCallInfoInput {\n    transmitterType: TransmitterType\n    name: String\n    data: String\n}\n\ninput ListenerInput {\n    listenerId: ID!\n    label: String\n    block: Boolean!\n    system: Boolean!\n    filter: ListenerFilterInput!\n    callInfo: ListenerCallInfoInput\n}\n\ninput AddListenerInput {\n    listener: ListenerInput!\n}",
            "template": "",
            "reducer": "",
            "errors": [],
            "examples": [],
            "scope": "local"
          },
          {
            "id": "qGCiPGpTt/cyz3HzyrBn92z10dsU=",
            "name": "REMOVE_LISTENER",
            "description": "",
            "schema": "input RemoveListenerInput {\n    listenerId: String!\n}",
            "template": "",
            "reducer": "",
            "errors": [],
            "examples": [],
            "scope": "local"
          },
          {
            "id": "qGCiPGpTt/cyz3HzyrBn92z20dsU=",
            "name": "ADD_TRIGGER",
            "description": "",
            "schema": "input PullResponderTriggerDataInput {\n    listenerId: ID!\n    url: String!\n    interval: String!\n}\n\ninput TriggerInput {\n    id: ID!\n    type: TriggerType!\n    data: PullResponderTriggerDataInput\n}\n\ninput AddTriggerInput {\n    trigger: TriggerInput!\n}",
            "template": "",
            "reducer": "",
            "errors": [],
            "examples": [],
            "scope": "local"
          },
          {
            "id": "qGCiPGpTt/cyz3HzyrBn92z30dsU=",
            "name": "REMOVE_TRIGGER",
            "description": "",
            "schema": "input RemoveTriggerInput {\n    triggerId: String!\n}",
            "template": "",
            "reducer": "",
            "errors": [],
            "examples": [],
            "scope": "local"
          }
        ]
      }
    ]
  }
};
return model.version({
  modules: [module0, module1],
  compatibility,
});
}

const DocumentDriveFamily = defineDocumentModelFamily({
  versions: [createDocumentDriveV1()],
  upgrades: [],
});

export const DocumentDriveV1 = DocumentDriveFamily.at(1);
export const documentModels = DocumentDriveFamily.modules;
export const upgradeManifests = [DocumentDriveFamily.upgradeManifest];
