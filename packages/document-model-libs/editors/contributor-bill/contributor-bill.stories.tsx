import Editor from "./editor";
import { createDocumentStory } from "../utils";

import * as ContributorBillModule from "../../document-models/contributor-bill";

const { meta, CreateDocumentStory: ContributorBill } = createDocumentStory(
  Editor,
  ContributorBillModule.reducer,
  ContributorBillModule.utils.createDocument(),
);
export { ContributorBill };

export default { ...meta, title: "Contributor Bill" };
