import type { DocumentModelModule } from "document-model";
import { createState } from "document-model";
import { defaultBaseState } from "document-model/core";
import type { SubgraphModulePHState } from "@powerhousedao/vetra/document-models/subgraph-module";
import {
  actions,
  documentModel,
  reducer,
  utils,
} from "@powerhousedao/vetra/document-models/subgraph-module";

/** Document model module for the Todo List document type */
export const SubgraphModule: DocumentModelModule<SubgraphModulePHState> = {
  reducer,
  actions,
  utils,
  documentModel: createState(defaultBaseState(), documentModel),
};
