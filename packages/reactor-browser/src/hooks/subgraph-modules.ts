import type { SubgraphModule } from "document-model";
import { useVetraPackages } from "./vetra-packages.js";

export function useSubgraphModules(): SubgraphModule[] | undefined {
  const vetraPackages = useVetraPackages();
  return vetraPackages?.flatMap((pkg) => pkg.modules.subgraphModules || []);
}
