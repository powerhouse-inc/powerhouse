import { ts } from "@tmpl/core";

export const upgradeManifestsTemplate = ts`
import type { UpgradeManifest } from "@powerhousedao/shared/document-model";

export const upgradeManifests: UpgradeManifest<readonly number[]>[] = [];
`.raw;
