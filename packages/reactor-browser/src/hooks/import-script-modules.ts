import type { ImportScriptModule } from "@powerhousedao/shared/document-model";
import { useVetraPackages } from "./vetra-packages.js";

export function useImportScriptModules(): ImportScriptModule[] | undefined {
  const vetraPackages = useVetraPackages();
  return vetraPackages?.flatMap((pkg) => pkg.modules.importScriptModules || []);
}
