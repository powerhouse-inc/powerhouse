import {
  defineDocumentModel,
  materialize,
  ph,
} from "../../../src/definition/index.js";

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

const Node = ph.union("Node", { members: [FolderNode, FileNode] });

const DocumentDriveState = ph.object("DocumentDriveState", {
  fields: {
    name: ph.String({ required: true }),
    nodes: ph.list(ph.ref(Node, { required: true }), {
      required: true,
      deprecated:
        "Use the reactor-drive subgraph (`reactorDrive.rootNodes`, `ReactorDriveFolderNode.children`) for paged listings.",
    }),
    icon: ph.String(),
  },
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

const TriggerType = ph.enum("TriggerType", { values: ["PullResponder"] });

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

const DocumentDriveLocalState = ph.object("DocumentDriveLocalState", {
  fields: {
    sharingType: ph.String(),
    listeners: ph.list(ph.ref(Listener, { required: true }), {
      required: true,
    }),
    triggers: ph.list(ph.ref(Trigger, { required: true }), { required: true }),
    availableOffline: ph.Boolean({ required: true }),
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

const context = defineDocumentModel({
  id: "powerhouse/document-drive",
  name: "DocumentDrive",
  description: "",
  extension: "phdd",
  version: 1,
  author: { name: "Powerhouse Inc", website: "https://www.powerhouse.inc/" },
  scopes: {
    global: {
      schema: DocumentDriveState,
      initialValue: { name: "", nodes: [], icon: null },
    },
    local: {
      schema: DocumentDriveLocalState,
      initialValue: {
        listeners: [],
        triggers: [],
        sharingType: "private",
        availableOffline: false,
      },
    },
  },
});

const node = context.module("node", {
  description: "",
  operations: ({ global }) => ({
    addFile: global({
      description: "",
      input: ph.input({
        fields: {
          id: ph.ID({ required: true }),
          name: ph.String({ required: true }),
          documentType: ph.String({ required: true }),
          parentFolder: ph.ID(),
        },
      }),
      template: "",
      reducerTemplate: "",
      reduce() {},
    }),
    addFolder: global({
      description: "",
      input: ph.input({
        fields: {
          id: ph.ID({ required: true }),
          name: ph.String({ required: true }),
          parentFolder: ph.ID(),
        },
      }),
      template: "",
      reducerTemplate: "",
      reduce() {},
    }),
    deleteNode: global({
      description: "",
      input: ph.input({
        fields: {
          id: ph.ID({ required: true }),
        },
      }),
      template: "",
      reducerTemplate: "",
      reduce() {},
    }),
    updateFile: global({
      description: "",
      input: ph.input({
        fields: {
          id: ph.ID({ required: true }),
          parentFolder: ph.ID(),
          name: ph.String(),
          documentType: ph.String(),
        },
      }),
      template: "",
      reducerTemplate: "",
      reduce() {},
    }),
    updateNode: global({
      description: "",
      input: ph.input({
        fields: {
          id: ph.ID({ required: true }),
          parentFolder: ph.ID(),
          name: ph.String(),
        },
      }),
      template: "",
      reducerTemplate: "",
      reduce() {},
    }),
    copyNode: global({
      description: "",
      input: ph.input({
        fields: {
          srcId: ph.ID({ required: true }),
          targetId: ph.ID({ required: true }),
          targetName: ph.String(),
          targetParentFolder: ph.ID(),
        },
      }),
      template: "",
      reducerTemplate: "",
      reduce() {},
    }),
    moveNode: global({
      description: "",
      input: ph.input({
        fields: {
          srcFolder: ph.ID({ required: true }),
          targetParentFolder: ph.ID(),
        },
      }),
      template: "",
      reducerTemplate: "",
      reduce() {},
    }),
  }),
});

const drive = context.module("drive", {
  description: "",
  operations: ({ global, local }) => ({
    setDriveName: global({
      description: "",
      input: ph.input({
        fields: {
          name: ph.String({ required: true }),
        },
      }),
      template: "",
      reducerTemplate: "",
      reduce() {},
    }),
    setDriveIcon: global({
      description: "",
      input: ph.input({
        fields: {
          icon: ph.String(),
        },
      }),
      template: "",
      reducerTemplate: "",
      reduce() {},
    }),
    setSharingType: local({
      description: "",
      input: ph.input({
        fields: {
          type: ph.String({ required: true }),
        },
      }),
      template: "",
      reducerTemplate: "",
      reduce() {},
    }),
    setAvailableOffline: local({
      description: "",
      input: ph.input({
        fields: {
          availableOffline: ph.Boolean({ required: true }),
        },
      }),
      template: "",
      reducerTemplate: "",
      reduce() {},
    }),
    addListener: local({
      description: "",
      input: ph.input({
        fields: {
          listener: ph.ref(ListenerInput, { required: true }),
        },
      }),
      template: "",
      reducerTemplate: "",
      reduce() {},
    }),
    removeListener: local({
      description: "",
      input: ph.input({
        fields: {
          listenerId: ph.String({ required: true }),
        },
      }),
      template: "",
      reducerTemplate: "",
      reduce() {},
    }),
    addTrigger: local({
      description: "",
      input: ph.input({
        fields: {
          trigger: ph.ref(TriggerInput, { required: true }),
        },
      }),
      template: "",
      reducerTemplate: "",
      reduce() {},
    }),
    removeTrigger: local({
      description: "",
      input: ph.input({
        fields: {
          triggerId: ph.String({ required: true }),
        },
      }),
      template: "",
      reducerTemplate: "",
      reduce() {},
    }),
  }),
});

export const documentDrive = materialize(
  context.version({ modules: [node, drive] }),
);
