import type { UpgradeTransition } from "document-model";

export const upgradeToV2: UpgradeTransition = {
  toVersion: 2,
  description: "Backfill the list name introduced in version 2.",
  upgradeReducer(document) {
    const globalState = (
      document as { state: { global: { listName?: string } } }
    ).state.global;
    globalState.listName ??= "Migrated code-first todos";
    return document;
  },
};
