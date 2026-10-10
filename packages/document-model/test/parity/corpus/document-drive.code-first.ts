/**
 * The code-first declaration of document-drive, equivalent to the stored
 * schema-first model in this repository down to every persisted byte.
 *
 * Reducers are empty: this fixture proves specification equality, which is
 * what `test/parity` compares. `test/replay` covers replay behavior with
 * its own pair.
 */
import { ph } from "../../../src/definition/field.js";
import { schemaFirstSpecification } from "../../../src/definition/compatibility.js";
import { defineDocumentModel } from "../../../src/definition/model.js";

const FolderNode = ph.object("FolderNode", {
  fields: {
    id: ph.String({ required: true }),
    name: ph.String({ required: true }),
    kind: ph.String({ required: true }),
    parentFolder: ph.String(),
  },
});

const FileNode = ph.object("FileNode", {
  fields: {
    id: ph.String({ required: true }),
    name: ph.String({ required: true }),
    kind: ph.String({ required: true }),
    documentType: ph.String({ required: true }),
    parentFolder: ph.String(),
  },
});

const Node = ph.union("Node", {
  members: [FolderNode, FileNode],
});

const ListenerFilter = ph.object("ListenerFilter", {
  fields: {
    documentType: ph.list(ph.String({ required: true })),
    documentId: ph.list(ph.ID({ required: true })),
    scope: ph.list(ph.String({ required: true })),
    branch: ph.list(ph.String({ required: true })),
  },
});

const TransmitterType = ph.enum("TransmitterType", {
  values: [
    "Internal",
    "SwitchboardPush",
    "PullResponder",
    "SecureConnect",
    "MatrixConnect",
    "RESTWebhook",
  ],
});

const ListenerCallInfo = ph.object("ListenerCallInfo", {
  fields: {
    transmitterType: ph.ref(TransmitterType),
    name: ph.String(),
    data: ph.String(),
  },
});

const Listener = ph.object("Listener", {
  fields: {
    listenerId: ph.ID({ required: true }),
    label: ph.String(),
    block: ph.Boolean({ required: true }),
    system: ph.Boolean({ required: true }),
    filter: ph.ref(ListenerFilter, { required: true }),
    callInfo: ph.ref(ListenerCallInfo),
  },
});

const TriggerType = ph.enum("TriggerType", {
  values: ["PullResponder"],
});

const PullResponderTriggerData = ph.object("PullResponderTriggerData", {
  fields: {
    listenerId: ph.ID({ required: true }),
    url: ph.String({ required: true }),
    interval: ph.String({ required: true }),
  },
});

const TriggerData = ph.union("TriggerData", {
  members: [PullResponderTriggerData],
});

const Trigger = ph.object("Trigger", {
  fields: {
    id: ph.ID({ required: true }),
    type: ph.ref(TriggerType, { required: true }),
    data: ph.ref(TriggerData),
  },
});

const ListenerFilterInput = ph.input("ListenerFilterInput", {
  fields: {
    documentType: ph.list(ph.String({ required: true })),
    documentId: ph.list(ph.ID({ required: true })),
    scope: ph.list(ph.String({ required: true })),
    branch: ph.list(ph.String({ required: true })),
  },
});

const ListenerCallInfoInput = ph.input("ListenerCallInfoInput", {
  fields: {
    transmitterType: ph.ref(TransmitterType),
    name: ph.String(),
    data: ph.String(),
  },
});

const ListenerInput = ph.input("ListenerInput", {
  fields: {
    listenerId: ph.ID({ required: true }),
    label: ph.String(),
    block: ph.Boolean({ required: true }),
    system: ph.Boolean({ required: true }),
    filter: ph.ref(ListenerFilterInput, { required: true }),
    callInfo: ph.ref(ListenerCallInfoInput),
  },
});

const PullResponderTriggerDataInput = ph.input(
  "PullResponderTriggerDataInput",
  {
    fields: {
      listenerId: ph.ID({ required: true }),
      url: ph.String({ required: true }),
      interval: ph.String({ required: true }),
    },
  },
);

const TriggerInput = ph.input("TriggerInput", {
  fields: {
    id: ph.ID({ required: true }),
    type: ph.ref(TriggerType, { required: true }),
    data: ph.ref(PullResponderTriggerDataInput),
  },
});

const contextV1 = defineDocumentModel({
  id: "powerhouse/document-drive",
  name: "DocumentDrive",
  description: "",
  extension: "phdd",
  version: 1,
  author: { name: "Powerhouse Inc", website: "https://www.powerhouse.inc/" },
  specifications: {
    global: {
      schema: ph.object("DocumentDriveState", {
        fields: {
          name: ph.String({ required: true }),
          nodes: ph.list(ph.ref(Node, { required: true }), {
            required: true,
            deprecated:
              "Use the reactor-drive subgraph (`reactorDrive.rootNodes`, `ReactorDriveFolderNode.children`) for paged listings.",
          }),
          icon: ph.String(),
        },
      }),
      initialValue: {
        name: "",
        nodes: [],
        icon: null,
      },
    },
    local: {
      schema: ph.object("DocumentDriveLocalState", {
        fields: {
          sharingType: ph.String(),
          listeners: ph.list(ph.ref(Listener, { required: true }), {
            required: true,
          }),
          triggers: ph.list(ph.ref(Trigger, { required: true }), {
            required: true,
          }),
          availableOffline: ph.Boolean({ required: true }),
        },
      }),
      initialValue: {
        listeners: [],
        triggers: [],
        sharingType: "private",
        availableOffline: false,
      },
    },
  },
});

const nodeV1 = contextV1.module("node", {
  description: "",
  operations: ({ global }) => ({
    addFile: global({
      input: ph.input({
        fields: {
          id: ph.ID({ required: true }),
          name: ph.String({ required: true }),
          documentType: ph.String({ required: true }),
          parentFolder: ph.ID(),
        },
      }),
      description: "",
      template: "",
      reducerTemplate: "",
      reduce() {},
    }),
    addFolder: global({
      input: ph.input({
        fields: {
          id: ph.ID({ required: true }),
          name: ph.String({ required: true }),
          parentFolder: ph.ID(),
        },
      }),
      description: "",
      template: "",
      reducerTemplate: "",
      reduce() {},
    }),
    deleteNode: global({
      input: ph.input({
        fields: {
          id: ph.ID({ required: true }),
        },
      }),
      description: "",
      template: "",
      reducerTemplate: "",
      reduce() {},
    }),
    updateFile: global({
      input: ph.input({
        fields: {
          id: ph.ID({ required: true }),
          parentFolder: ph.ID(),
          name: ph.String(),
          documentType: ph.String(),
        },
      }),
      description: "",
      template: "",
      reducerTemplate: "",
      reduce() {},
    }),
    updateNode: global({
      input: ph.input({
        fields: {
          id: ph.ID({ required: true }),
          parentFolder: ph.ID(),
          name: ph.String(),
        },
      }),
      description: "",
      template: "",
      reducerTemplate: "",
      reduce() {},
    }),
    copyNode: global({
      input: ph.input({
        fields: {
          srcId: ph.ID({ required: true }),
          targetId: ph.ID({ required: true }),
          targetName: ph.String(),
          targetParentFolder: ph.ID(),
        },
      }),
      description: "",
      template: "",
      reducerTemplate: "",
      reduce() {},
    }),
    moveNode: global({
      input: ph.input({
        fields: {
          srcFolder: ph.ID({ required: true }),
          targetParentFolder: ph.ID(),
        },
      }),
      description: "",
      template: "",
      reducerTemplate: "",
      reduce() {},
    }),
  }),
});

const driveV1 = contextV1.module("drive", {
  description: "",
  operations: ({ global, local }) => ({
    setDriveName: global({
      input: ph.input({
        fields: {
          name: ph.String({ required: true }),
        },
      }),
      description: "",
      template: "",
      reducerTemplate: "",
      reduce() {},
    }),
    setDriveIcon: global({
      input: ph.input({
        fields: {
          icon: ph.String(),
        },
      }),
      description: "",
      template: "",
      reducerTemplate: "",
      reduce() {},
    }),
    setSharingType: local({
      input: ph.input({
        fields: {
          type: ph.String({ required: true }),
        },
      }),
      description: "",
      template: "",
      reducerTemplate: "",
      reduce() {},
    }),
    setAvailableOffline: local({
      input: ph.input({
        fields: {
          availableOffline: ph.Boolean({ required: true }),
        },
      }),
      description: "",
      template: "",
      reducerTemplate: "",
      reduce() {},
    }),
    addListener: local({
      input: ph.input({
        fields: {
          listener: ph.ref(ListenerInput, { required: true }),
        },
      }),
      description: "",
      template: "",
      reducerTemplate: "",
      reduce() {},
    }),
    removeListener: local({
      input: ph.input({
        fields: {
          listenerId: ph.String({ required: true }),
        },
      }),
      description: "",
      template: "",
      reducerTemplate: "",
      reduce() {},
    }),
    addTrigger: local({
      input: ph.input({
        fields: {
          trigger: ph.ref(TriggerInput, { required: true }),
        },
      }),
      description: "",
      template: "",
      reducerTemplate: "",
      reduce() {},
    }),
    removeTrigger: local({
      input: ph.input({
        fields: {
          triggerId: ph.String({ required: true }),
        },
      }),
      description: "",
      template: "",
      reducerTemplate: "",
      reduce() {},
    }),
  }),
});

export const DefinitionV1 = contextV1.finalize({
  modules: [nodeV1, driveV1],
  compatibility: schemaFirstSpecification({
    ids: {
      "module/node": "GRzuvv78tBvmB6ciitokLfonNHA=",
      "operation/node/addFile": "7xiTdxonc9yEASR8sfV/KnbSV10=",
      "operation/node/addFolder": "4lzNMMKKdIAtEU6i12xLgi9hp+U=",
      "operation/node/deleteNode": "53jH2/3TWTTcgCJiv2C+BmuC6i0=",
      "operation/node/updateFile": "pNn+Y1/HVq/GNMk7t0u3g3gtMLE=",
      "operation/node/updateNode": "P0x1M8Mnt+Q/+9nggkwgVbfybsc=",
      "operation/node/copyNode": "vnQ7OB5b3wGLgjhbgJqAIpA+JLE=",
      "operation/node/moveNode": "VNyiD/sNGzk6k9A1Qe7s8dmrJxA=",
      "module/drive": "0dHwHlxOM9x0vMZ+gLnKxf2qTEo=",
      "operation/drive/setDriveName": "qGCiPGpTt/cyz3HzyrBn92z1dsU=",
      "operation/drive/setDriveIcon": "qGCiPGpTt/cyz3HzyrBn92z30dsU=",
      "operation/drive/setSharingType": "qGCiPGpTt/cyz3HzyrBn92z2dsU=",
      "operation/drive/setAvailableOffline": "qGCiPGpTt/cyz3HzyrBn92z3dsU=",
      "operation/drive/addListener": "qGCiPGpTt/cyz3HzyrBn92z9dsU=",
      "operation/drive/removeListener": "qGCiPGpTt/cyz3HzyrBn92z10dsU=",
      "operation/drive/addTrigger": "qGCiPGpTt/cyz3HzyrBn92z20dsU=",
      "operation/drive/removeTrigger": "qGCiPGpTt/cyz3HzyrBn92z30dsU=",
    },
    names: {
      "operation/node/addFile": { storedName: "ADD_FILE" },
      "operation/node/addFolder": { storedName: "ADD_FOLDER" },
      "operation/node/deleteNode": { storedName: "DELETE_NODE" },
      "operation/node/updateFile": { storedName: "UPDATE_FILE" },
      "operation/node/updateNode": { storedName: "UPDATE_NODE" },
      "operation/node/copyNode": { storedName: "COPY_NODE" },
      "operation/node/moveNode": { storedName: "MOVE_NODE" },
      "operation/drive/setDriveName": { storedName: "SET_DRIVE_NAME" },
      "operation/drive/setDriveIcon": { storedName: "SET_DRIVE_ICON" },
      "operation/drive/setSharingType": { storedName: "SET_SHARING_TYPE" },
      "operation/drive/setAvailableOffline": {
        storedName: "SET_AVAILABLE_OFFLINE",
      },
      "operation/drive/addListener": { storedName: "ADD_LISTENER" },
      "operation/drive/removeListener": { storedName: "REMOVE_LISTENER" },
      "operation/drive/addTrigger": { storedName: "ADD_TRIGGER" },
      "operation/drive/removeTrigger": { storedName: "REMOVE_TRIGGER" },
    },
    serialization: {
      "state/global/schema":
        'type FolderNode {\n    id: String!\n    name: String!\n    kind: String!\n    parentFolder: String\n}\n\ntype FileNode {\n    id: String!\n    name: String!\n    kind: String!\n    documentType: String!\n    parentFolder: String\n}\n\nunion Node = FolderNode | FileNode\n\ntype DocumentDriveState {\n    name: String!\n    nodes: [Node!]! @deprecated(reason: "Use the reactor-drive subgraph (`reactorDrive.rootNodes`, `ReactorDriveFolderNode.children`) for paged listings.")\n    icon: String\n}',
      "state/local/schema":
        "type ListenerFilter {\n    documentType: [String!]\n    documentId: [ID!]\n    scope: [String!]\n    branch: [String!]\n}\n\nenum TransmitterType {\n    Internal,\n    SwitchboardPush,\n    PullResponder,\n    SecureConnect, \n    MatrixConnect,\n    RESTWebhook\n}\n\ntype ListenerCallInfo {\n    transmitterType: TransmitterType\n    name: String\n    data: String\n}\n\ntype Listener {\n    listenerId: ID!\n    label: String\n    block: Boolean!\n    system: Boolean!\n    filter: ListenerFilter!\n    callInfo: ListenerCallInfo\n}\n\nenum TriggerType {\n    PullResponder\n}\n\ntype PullResponderTriggerData {\n    listenerId: ID!\n    url: String!\n    interval: String!\n}\n\nunion TriggerData = PullResponderTriggerData\n\ntype Trigger {\n    id: ID!\n    type: TriggerType!\n    data: TriggerData\n}\n\ntype DocumentDriveLocalState{\n    sharingType: String\n    listeners: [Listener!]!\n    triggers: [Trigger!]!\n    availableOffline: Boolean!\n}",
      "state/local/initialValue":
        '{ "listeners": [], "triggers": [], "sharingType": "private", "availableOffline": false}',
      "operation/node/addFile/schema":
        "input AddFileInput {\n    id: ID!\n    name: String!\n    documentType: String!\n    parentFolder: ID\n}",
      "operation/node/addFolder/schema":
        "input AddFolderInput {\n    id: ID!\n    name: String!\n    parentFolder: ID\n}",
      "operation/node/deleteNode/schema":
        "input DeleteNodeInput {\n    id: ID!\n}",
      "operation/node/updateFile/schema":
        "input UpdateFileInput {\n    id: ID!\n    parentFolder: ID\n    name: String\n    documentType: String\n}",
      "operation/node/updateNode/schema":
        "input UpdateNodeInput {\n    id: ID!\n    parentFolder: ID\n    name: String\n}",
      "operation/node/copyNode/schema":
        "input CopyNodeInput {\n    srcId: ID!\n    targetId: ID!\n    targetName: String\n    targetParentFolder: ID\n}",
      "operation/node/moveNode/schema":
        "input MoveNodeInput {\n    srcFolder: ID!\n    targetParentFolder: ID\n}",
      "operation/drive/setDriveName/schema":
        "input SetDriveNameInput {\n    name: String!\n}",
      "operation/drive/setDriveIcon/schema":
        "input SetDriveIconInput {\n    icon: String\n}",
      "operation/drive/setSharingType/schema":
        "input SetSharingTypeInput {\n    type: String!\n}",
      "operation/drive/setAvailableOffline/schema":
        "input SetAvailableOfflineInput {\n    availableOffline: Boolean!\n}",
      "operation/drive/addListener/schema":
        "input ListenerFilterInput {\n    documentType: [String!]\n    documentId: [ID!]\n    scope: [String!]\n    branch: [String!]\n}\n\ninput ListenerCallInfoInput {\n    transmitterType: TransmitterType\n    name: String\n    data: String\n}\n\ninput ListenerInput {\n    listenerId: ID!\n    label: String\n    block: Boolean!\n    system: Boolean!\n    filter: ListenerFilterInput!\n    callInfo: ListenerCallInfoInput\n}\n\ninput AddListenerInput {\n    listener: ListenerInput!\n}",
      "operation/drive/removeListener/schema":
        "input RemoveListenerInput {\n    listenerId: String!\n}",
      "operation/drive/addTrigger/schema":
        "input PullResponderTriggerDataInput {\n    listenerId: ID!\n    url: String!\n    interval: String!\n}\n\ninput TriggerInput {\n    id: ID!\n    type: TriggerType!\n    data: PullResponderTriggerDataInput\n}\n\ninput AddTriggerInput {\n    trigger: TriggerInput!\n}",
      "operation/drive/removeTrigger/schema":
        "input RemoveTriggerInput {\n    triggerId: String!\n}",
    },
  }),
});

export const modules = [DefinitionV1];
