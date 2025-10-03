import { connectConfig } from "@powerhousedao/connect/config";
import { convertLegacyLibToVetraPackage } from "@powerhousedao/reactor-browser";

const { externalPackagesEnabled } = connectConfig;

export async function loadExternalPackages() {
  try {
    if (!externalPackagesEnabled) return [];
    const module = await import("virtual:ph:external-packages");
    const legacyLibs = module.default;
    return legacyLibs.map(convertLegacyLibToVetraPackage);
  } catch (error) {
    console.error(error);
    return [];
  }
}
