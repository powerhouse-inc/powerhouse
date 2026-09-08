import {
  defineDocumentModelFamily,
  type UpgradeManifest,
} from "document-model";
import { upgrades } from "./upgrades/index.js";
import { codeFirstTodoV1Definition } from "./v1/model.js";
import { codeFirstTodoV2Definition } from "./v2/model.js";

const versions = [
  codeFirstTodoV1Definition,
  codeFirstTodoV2Definition,
] as const;

export const CodeFirstTodoFamily = defineDocumentModelFamily({
  versions,
  upgrades,
});

export const CodeFirstTodoV1 = CodeFirstTodoFamily.at(1);
export const CodeFirstTodoV2 = CodeFirstTodoFamily.at(2);

export const codeFirstTodoUpgradeManifest: UpgradeManifest<readonly number[]> =
  CodeFirstTodoFamily.upgradeManifest;
