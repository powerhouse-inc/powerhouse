import connectConfig from "#connect-config";
import { convertLegacyLibToVetraPackage } from "@powerhousedao/reactor-browser";
import type { DocumentModelLib } from "document-model";

const externalPackagesUrl =
  connectConfig.routerBasename + "external-packages.js";
const externalPackagesEnabled = import.meta.env.PROD;

export async function loadExternalPackages() {
  try {
    if (!externalPackagesEnabled) return [];
    const module = (await import(/* @vite-ignore */ externalPackagesUrl)) as
      | {
          default?: DocumentModelLib[];
        }
      | undefined;
    const legacyLibs = module?.default;
    if (!legacyLibs) return [];
    return legacyLibs.map(convertLegacyLibToVetraPackage);
  } catch (error) {
    console.error(error);
    return [];
  }
}
