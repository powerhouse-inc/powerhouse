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

export async function loadExternalPackages({
  localPackage,
  packages,
}: {
  localPackage?: DocumentModelLib;
  packages: string[];
}) {
  try {
    if (!externalPackagesEnabled) return [];
    const module = {
      loadExternalPackages: () =>
        _loadExternalPackages2({ localPackage, packages }),
    };
    return convertExternalPackages(module);
  } catch (error) {
    console.error(error);
    return [];
  }
}
async function _loadExternalPackages2({
  localPackage,
  packages,
}: {
  localPackage?: DocumentModelLib;
  packages: string[];
}) {
  const packageImports = packages.map((pkg) => ({
    name: pkg,
    js: pkg,
    css: pkg + "/style.css",
  }));

  const modules: (DocumentModelLib & { id: string })[] = [];

  if (localPackage) {
    modules.push({
      id: `local-package`,
      ...localPackage,
    });
  }
  console.log(packageImports);

  // packageImports.forEach(async (pkg, index) => {
  //   try {
  //     const module = (await import(pkg.js)) as DocumentModelLib;
  //     await import(pkg.css);
  //     modules.push({
  //       id: `module${index}`,
  //       ...module,
  //     });
  //   } catch (error) {
  //     console.error("Error loading package: '${pkg.name}'", error);
  //   }
  // });
  return modules;
}
