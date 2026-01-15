import type { DocumentModelModule, UpgradeManifest } from "document-model";
import { upgradeManifest as todoUpgradeManifest } from "./todo/upgrades/upgrade-manifest.js";
import { Todo as TodoV1 } from "./todo/v1/module.js";
import { Todo as TodoV2 } from "./todo/v2/module.js";

export const documentModels: DocumentModelModule<any>[] = [TodoV1, TodoV2];
export const upgradeManifests: UpgradeManifest<readonly number[]>[] = [
  todoUpgradeManifest,
];
