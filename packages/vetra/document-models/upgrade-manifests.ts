/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type { UpgradeManifest } from "document-model";
import { appModuleUpgradeManifest } from "document-models/app-module/upgrades";
import { documentEditorUpgradeManifest } from "document-models/document-editor/upgrades";
import { processorModuleUpgradeManifest } from "document-models/processor-module/upgrades";
import { subgraphModuleUpgradeManifest } from "document-models/subgraph-module/upgrades";
import { vetraPackageUpgradeManifest } from "document-models/vetra-package/upgrades";

export const upgradeManifests: UpgradeManifest<readonly number[]>[] = [
  appModuleUpgradeManifest,
  documentEditorUpgradeManifest,
  processorModuleUpgradeManifest,
  subgraphModuleUpgradeManifest,
  vetraPackageUpgradeManifest,
];
