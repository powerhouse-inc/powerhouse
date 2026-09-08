import type { DocumentModelModule } from "@powerhousedao/shared/document-model";
import {
  LoaderFamily,
  LoaderModelV1 as CodeFirstLoaderModelV1,
  LoaderModelV2 as CodeFirstLoaderModelV2,
  upgradeManifests,
} from "./source-models.js";

function withoutDefinition(
  module: DocumentModelModule<any>,
): DocumentModelModule<any> {
  const { definition: _definition, ...legacy } = module;
  return legacy;
}

export const LoaderModelV1 = withoutDefinition(CodeFirstLoaderModelV1);
export const LoaderModelV2 = withoutDefinition(CodeFirstLoaderModelV2);
export const documentModels = [LoaderModelV1, LoaderModelV2] as const;
export { LoaderFamily, upgradeManifests };
export const nested = { "model/v1": LoaderModelV1 } as const;
