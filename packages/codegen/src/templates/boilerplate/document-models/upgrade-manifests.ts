import { ts } from "@tmpl/core";

export const upgradeManifestsTemplate = ts`
import type { UpgradeManifest } from "document-model";

export const upgradeManifests: UpgradeManifest<readonly number[]>[] = [];
`.raw;
