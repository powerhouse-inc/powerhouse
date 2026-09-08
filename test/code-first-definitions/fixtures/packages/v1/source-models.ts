import {
  defineDocumentModel,
  defineDocumentModelFamily,
  ph,
  type UpgradeTransition,
} from "document-model";

function version<const TVersion extends 1 | 2>(version: TVersion) {
  const model = defineDocumentModel({
    id: "powerhouse/loader-fixture",
    name: "Loader Fixture",
    description: "A two-version model used to lock current package loaders.",
    extension: "ph-loader-fixture",
    version,
    author: { name: "Powerhouse" },
    specifications: {
      global: {
        schema: ph.object("LoaderFixtureState", {
          fields: {
            value: ph.Int({ required: true }),
          },
        }),
        initialValue: { value: 0 },
      },
      local: { schema: null, initialValue: {} },
    },
  });
  return model.version({ modules: [] });
}

const upgrade: UpgradeTransition = {
  toVersion: 2,
  upgradeReducer(document) {
    return document;
  },
};

export const LoaderFamily = defineDocumentModelFamily({
  versions: [version(1), version(2)],
  upgrades: [upgrade],
});
export const LoaderModelV1 = LoaderFamily.at(1);
export const LoaderModelV2 = LoaderFamily.at(2);
export const documentModels = LoaderFamily.modules;
export const upgradeManifests = [LoaderFamily.upgradeManifest];
export const nested = { "model/v1": LoaderModelV1 } as const;
