import { type ImportScriptModule, type SubgraphModule } from "document-model";
import { useSyncExternalStore } from "react";
import { DEFAULT_DRIVE_EDITOR_ID } from "../constants.js";
import {
  dispatchSetVetraPackagesEvent,
  subscribeToVetraPackages,
} from "../events/vetra-packages.js";
import {
  type Processors,
  type VetraDocumentModelModule,
  type VetraEditorModule,
  type VetraPackage,
  type VetraProcessorModule,
} from "../types/vetra.js";

export function useVetraPackages(): VetraPackage[] {
  return useSyncExternalStore(
    subscribeToVetraPackages,
    () => window.vetraPackages || [],
  );
}

export function setVetraPackages(packages: VetraPackage[]) {
  dispatchSetVetraPackagesEvent(packages);
}

export function useDocumentModelModules(): VetraDocumentModelModule[] {
  const vetraPackages = useVetraPackages();
  return vetraPackages.flatMap((pkg) => pkg.modules.documentModelModules || []);
}

export function useEditorModules(): VetraEditorModule[] {
  const vetraPackages = useVetraPackages();
  return vetraPackages
    .flatMap((pkg) => pkg.modules.editorModules || [])
    .filter(
      (module) => !module.documentTypes.includes("powerhouse/document-drive"),
    );
}

export function useDriveEditorModules(): VetraEditorModule[] {
  const vetraPackages = useVetraPackages();
  return vetraPackages
    .flatMap((pkg) => pkg.modules.editorModules || [])
    .filter((module) =>
      module.documentTypes.includes("powerhouse/document-drive"),
    );
}

export function useDocumentModelModuleById(id: string | null | undefined) {
  const documentModelModules = useDocumentModelModules();
  return documentModelModules.find((module) => module.documentModel.id === id);
}

export function useEditorModuleById(id: string | null | undefined) {
  const editorModules = useEditorModules();
  return editorModules.find((module) => module.id === id);
}

export function useFallbackEditorModule(
  documentType: string | null | undefined,
) {
  const editorModules = useEditorModules();
  if (!documentType) return undefined;
  if (editorModules.length === 0) return undefined;

  const modulesForType = editorModules.filter((module) =>
    module.documentTypes.includes(documentType),
  );
  return modulesForType[0];
}

export function useDriveEditorModuleById(id: string | null | undefined) {
  const driveEditorModules = useDriveEditorModules();
  return driveEditorModules.find((module) => module.id === id);
}

export function useDefaultDriveEditorModule() {
  const defaultDriveEditorModule = useDriveEditorModuleById(
    DEFAULT_DRIVE_EDITOR_ID,
  );
  return defaultDriveEditorModule;
}

export function useEditorModulesForDocumentType(
  documentType: string | null | undefined,
) {
  const editorModules = useEditorModules();
  if (!documentType) return undefined;

  const modulesForType = editorModules.filter((module) =>
    module.documentTypes.includes(documentType),
  );
  return modulesForType;
}

export function useProcessorModules(): VetraProcessorModule[] {
  const vetraPackages = useVetraPackages();
  return vetraPackages.flatMap((pkg) => pkg.modules.processorModules || []);
}

export function useProcessors(): Processors[] {
  const processorModules = useProcessorModules();
  return processorModules.flatMap((module) => module.processors);
}

export function useSubgraphModules(): SubgraphModule[] {
  const vetraPackages = useVetraPackages();
  return vetraPackages.flatMap((pkg) => pkg.modules.subgraphModules || []);
}

export function useImportScriptModules(): ImportScriptModule[] {
  const vetraPackages = useVetraPackages();
  return vetraPackages.flatMap((pkg) => pkg.modules.importScriptModules || []);
}
