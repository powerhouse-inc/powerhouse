import type {
  Processors,
  VetraDocumentModelModule,
  VetraEditorModule,
  VetraPackage,
  VetraProcessorModule,
} from "@powerhousedao/reactor-browser";
import {
  DEFAULT_DRIVE_EDITOR_ID,
  dispatchSetVetraPackagesEvent,
  subscribeToVetraPackages,
} from "@powerhousedao/reactor-browser";
import type { ImportScriptModule, SubgraphModule } from "document-model";
import { useSyncExternalStore } from "react";

const defaultVetraPackages: VetraPackage[] = [];

export function useVetraPackages(): VetraPackage[] {
  return useSyncExternalStore(
    subscribeToVetraPackages,
    () => window.vetraPackages || defaultVetraPackages,
  );
}

export function setVetraPackages(packages: VetraPackage[]) {
  dispatchSetVetraPackagesEvent(packages);
}

export function useDocumentModelModules():
  | VetraDocumentModelModule[]
  | undefined {
  const vetraPackages = useVetraPackages();
  return vetraPackages.flatMap((pkg) => pkg.modules.documentModelModules || []);
}

export function useEditorModules(): VetraEditorModule[] | undefined {
  const vetraPackages = useVetraPackages();
  return vetraPackages
    .flatMap((pkg) => pkg.modules.editorModules || [])
    .filter(
      (module) => !module.documentTypes.includes("powerhouse/document-drive"),
    );
}

export function useDriveEditorModules(): VetraEditorModule[] | undefined {
  const vetraPackages = useVetraPackages();
  return vetraPackages
    .flatMap((pkg) => pkg.modules.editorModules || [])
    .filter((module) =>
      module.documentTypes.includes("powerhouse/document-drive"),
    );
}

export function useDocumentModelModuleById(
  id: string | null | undefined,
): VetraDocumentModelModule | undefined {
  const documentModelModules = useDocumentModelModules();
  return documentModelModules.find((module) => module.documentModel.id === id);
}

export function useEditorModuleById(
  id: string | null | undefined,
): VetraEditorModule | undefined {
  const editorModules = useEditorModules();
  return editorModules.find((module) => module.id === id);
}

export function useFallbackEditorModule(
  documentType: string | null | undefined,
): VetraEditorModule | undefined {
  const editorModules = useEditorModules();
  if (!documentType) return undefined;
  if (editorModules.length === 0) return undefined;

  const modulesForType = editorModules.filter((module) =>
    module.documentTypes.includes(documentType),
  );
  return modulesForType[0];
}

export function useDriveEditorModuleById(
  id: string | null | undefined,
): VetraEditorModule | undefined {
  const driveEditorModules = useDriveEditorModules();
  return driveEditorModules.find((module) => module.id === id);
}

export function useDefaultDriveEditorModule(): VetraEditorModule | undefined {
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

export function useProcessorModules(): VetraProcessorModule[] | undefined {
  const vetraPackages = useVetraPackages();
  return vetraPackages
    ?.flatMap((pkg) => pkg.modules.processorModules)
    .filter((module) => module !== undefined);
}

export function useProcessors(): Processors[] | undefined {
  const processorModules = useProcessorModules();
  return processorModules?.flatMap((module) => module.processors);
}

export function useSubgraphModules(): SubgraphModule[] | undefined {
  const vetraPackages = useVetraPackages();
  return vetraPackages.flatMap((pkg) => pkg.modules.subgraphModules || []);
}

export function useImportScriptModules(): ImportScriptModule[] | undefined {
  const vetraPackages = useVetraPackages();
  return vetraPackages.flatMap((pkg) => pkg.modules.importScriptModules || []);
}
