import { ts } from "@tmpl/core";

export const upgradeManifestsTemplate = ts`
/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type { UpgradeManifest } from "document-model";

export const upgradeManifests: UpgradeManifest<readonly number[]>[] = [];
`.raw;
