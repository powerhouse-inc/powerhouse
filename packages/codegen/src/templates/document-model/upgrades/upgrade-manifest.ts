import { ts } from "@tmpl/core";
import type { DocumentModelFileMakerArgs } from "file-builders";

export const upgradeManifestTemplate = (v: DocumentModelFileMakerArgs) =>
  ts`
/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
  import type { UpgradeManifest } from "document-model";
  import { latestVersion, supportedVersions } from "./versions.js";

  export const ${v.upgradeManifestName}: UpgradeManifest<typeof supportedVersions> = {
    documentType: "${v.documentModelState.id}",
    latestVersion,
    supportedVersions,
    upgrades: {},
  };
  `.raw;
