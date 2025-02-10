export const mockReactorOptions = [
  {
    label: "Local Reactor",
    value: "local-reactor",
  },
  {
    label: "Switchboard",
    value: "switchboard",
  },
];

export const mockPackages = [
  {
    id: "@sky-ph/rwa",
    name: "RWA Reporting Package",
    description:
      "The real world assets portfolio reporting package for the sky ecosystem.",
    category: "Finance",
    publisher: "@powerhousedao",
    publisherUrl: "https://www.powerhouse.inc/",
    modules: [
      "Analytics Processor (Switchboard)",
      "RWA Portfolio Report Document Model (Connect)",
      "RWA Portfolio Report Editor (Connect)",
    ],
  },
  {
    id: "@powerhousedao/builder-tooling",
    name: "Builder Tooling",
    description:
      "The real world assets portfolio reporting package for the sky ecosystem.",
    category: "Finance",
    publisher: "@powerhousedao",
    publisherUrl: "https://www.powerhouse.inc/",
    modules: [
      "Analytics Processor (Switchboard)",
      "RWA Portfolio Report Document Model (Connect)",
      "RWA Portfolio Report Editor (Connect)",
    ],
  },
];

export const mockDocumentModelEditorOptions = [
  { label: "V1", value: "document-model-editor" },
  { label: "V2", value: "document-model-editor-v2" },
];
