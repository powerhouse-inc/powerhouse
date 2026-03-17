import type { SubgraphModulePHState } from "@powerhousedao/vetra/document-models/subgraph-module";
import {
  actions,
  documentModel,
  reducer,
  utils,
} from "@powerhousedao/vetra/document-models/subgraph-module";
import type { DocumentModelModule } from "document-model";
import { createState, defaultBaseState } from "document-model";

/** Document model module for the Todo List document type */
export const SubgraphModule: DocumentModelModule<SubgraphModulePHState> = {
  version: 1,
  reducer,
  actions,
  utils,
  documentModel: createState(defaultBaseState(), documentModel),
};
