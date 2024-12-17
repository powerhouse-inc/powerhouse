/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { createDocumentStory } from "document-model-libs/utils";
import { reducer, utils } from "../../document-models/legal-entity";
import Editor from "./editor";

const { meta, CreateDocumentStory: LegalEntity } = createDocumentStory(
  Editor,
  reducer,
  utils.createExtendedState({
    state: { global: {}, local: {} },
  }),
);

export default {
  ...meta,
  title: "LegalEntity",
};

export { LegalEntity };
