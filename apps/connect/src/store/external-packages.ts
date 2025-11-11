import { connectConfig } from "@powerhousedao/connect/config";
import {
  convertLegacyLibToVetraPackage,
  type VetraPackage,
} from "@powerhousedao/reactor-browser";
import type { DocumentModelLib } from "document-model";

type ExternalPackagesModule = {
  loadExternalPackages: () => Promise<DocumentModelLib[]>;
};

const { externalPackagesEnabled } = connectConfig;

const callbacks: ((packages: VetraPackage[]) => unknown)[] = [];

if (import.meta.hot) {
  import.meta.hot.accept("virtual:ph:external-packages", (data) => {
    convertExternalPackages(data as unknown as ExternalPackagesModule)
      .then((packages) => {
        callbacks.forEach((callback) => {
          callback(packages);
        });
      })
      .catch(console.error);
  });
}

function convertExternalPackages(module: ExternalPackagesModule) {
  return module.loadExternalPackages().then((packages) => {
    return packages.map(convertLegacyLibToVetraPackage);
  });
}

export function subscribeExternalPackages(
  callback: (packages: VetraPackage[]) => unknown,
) {
  callbacks.push(callback);
}

export async function loadExternalPackages() {
  try {
    if (!externalPackagesEnabled) return [];
    const module = await import("virtual:ph:external-packages");
    return convertExternalPackages(module);
  } catch (error) {
    console.error(error);
    return [];
  }
}
