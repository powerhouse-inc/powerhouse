import type { DocumentModelModule, UpgradeManifest } from "document-model";

export const VERSIONED_DOC_TYPE = "test/versioned-doc";

function createMockModule(version: number): DocumentModelModule {
  return {
    version,
    reducer: (document: unknown) => document,
    actions: {},
    utils: {
      createDocument: () => ({}),
      createState: () => ({}),
    },
    documentModel: {
      global: {
        id: VERSIONED_DOC_TYPE,
        name: "Versioned Test Doc",
        description: "Test document for versioning",
        extension: "vtd",
        author: { name: "Test", website: "" },
        specifications: [],
      },
      local: {},
    },
  } as unknown as DocumentModelModule;
}

export const testDocV1Module = createMockModule(1);
export const testDocV2Module = createMockModule(2);
export const testDocV3Module = createMockModule(3);

export const testDocUpgradeManifest = {
  documentType: VERSIONED_DOC_TYPE,
  latestVersion: 3,
  supportedVersions: [1, 2, 3] as const,
  upgrades: {
    v2: {
      toVersion: 2,
      upgradeReducer: (doc: unknown) => doc,
      description: "Add description field",
    },
    v3: {
      toVersion: 3,
      upgradeReducer: (doc: unknown) => doc,
      description: "Add tags field",
    },
  },
} as unknown as UpgradeManifest<readonly [1, 2, 3]>;
