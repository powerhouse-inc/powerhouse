import { ts } from "@tmpl/core";

export const upgradeManifestTemplate = (v: {
  documentModelId: string;
  upgradeManifestName: string;
}) =>
  ts`
/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
  import type { UpgradeManifest } from "document-model";
  import { latestVersion, supportedVersions } from "./versions.js";

  export const ${v.upgradeManifestName}: UpgradeManifest<typeof supportedVersions> = {
    documentType: "${v.documentModelId}",
    latestVersion,
    supportedVersions,
    upgrades: {},
  };
  `.raw;
