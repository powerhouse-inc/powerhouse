import { connectConfig } from "@powerhousedao/connect/config";
import { convertLegacyLibToVetraPackage } from "@powerhousedao/reactor-browser";

const externalPackagesUrl =
  connectConfig.routerBasename + "external-packages.js";
const externalPackagesEnabled = true; //import.meta.env.PROD;

export async function loadExternalPackages() {
  try {
    if (!externalPackagesEnabled) return [];
    const module = await import("ph:external-packages");
    const legacyLibs = module.default;
    return legacyLibs.map(convertLegacyLibToVetraPackage);
  } catch (error) {
    console.error(error);
    return [];
  }
}
