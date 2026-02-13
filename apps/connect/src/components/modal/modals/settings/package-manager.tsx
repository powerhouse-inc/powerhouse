import { PH_PACKAGES } from "@powerhousedao/config";
import { PackageManager } from "@powerhousedao/design-system/connect";
import {
  makeVetraPackageManifest,
  useDrives,
  useVetraPackageManager,
  useVetraPackages,
} from "@powerhousedao/reactor-browser";
import type { Manifest } from "document-model";
import React, { useCallback, useEffect, useMemo, useState } from "react";

const LOCAL_REACTOR_VALUE = "local-reactor";
const LOCAL_REACTOR_LABEL = "Local Reactor";

function manifestToDetails(
  manifest: Manifest | undefined,
  id: string,
  removable: boolean,
) {
  if (!manifest) {
    return undefined;
  }

  const documentModels =
    manifest.documentModels?.map((dm) => `Document Model: ${dm.name}`) ?? [];
  const editors =
    manifest.editors?.map((editor) => `Editor: ${editor.name}`) ?? [];
  const apps = manifest.apps?.map((app) => `App: ${app.name}`) ?? [];
  return {
    id,
    ...manifest,
    publisher: manifest.publisher.name,
    publisherUrl: manifest.publisher.url,
    modules: documentModels.concat(editors).concat(apps),
    removable,
  };
}

const PH_PACKAGES_REGISTRY = "http://localhost:8080/";

export const ConnectPackageManager: React.FC = () => {
  const packageManager = useVetraPackageManager();
  const vetraPackages = useVetraPackages();
  const drives = useDrives();
  const [reactor, setReactor] = useState("");
  const [registryUrl, setRegistryUrl] = useState(PH_PACKAGES_REGISTRY);

  const reactorOptions = useMemo(() => {
    return drives?.reduce<
      { value: string; label: string; disabled: boolean }[]
    >(
      (acc, drive) => {
        const trigger = drive.state.local.triggers.find(
          (trigger) => trigger.data?.url,
        );
        if (!trigger?.data?.url) {
          return acc;
        }

        const value = trigger.data.url;
        const label = drive.state.global.name;

        acc.push({
          value,
          label,
          disabled: true,
        });
        return acc;
      },
      [
        {
          value: LOCAL_REACTOR_VALUE,
          label: LOCAL_REACTOR_LABEL,
          disabled: false,
        },
      ],
    );
  }, [drives]);

  useEffect(() => {
    setReactor((reactor) => {
      const defaultOption = reactorOptions?.find((option) => !option.disabled);
      if (
        reactor &&
        reactorOptions?.find((option) => option.value === reactor)
      ) {
        return reactor;
      } else {
        return defaultOption?.value ?? "";
      }
    });
  }, [reactor, reactorOptions]);

  const packagesInfo = useMemo(
    () => vetraPackages.map((pkg) => makeVetraPackageManifest(pkg)),
    [vetraPackages],
  );

  const handleReactorChange = useCallback(
    (reactor?: string) => setReactor(reactor ?? ""),
    [],
  );
  const handleInstall = useCallback(
    (packageName: string) => {
      if (reactor !== LOCAL_REACTOR_VALUE) {
        throw new Error("Cannot install external package on a remote reactor");
      }
      console.debug("Installing package", packageName, "from", registryUrl);
      return packageManager?.addPackage(packageName, registryUrl);
    },
    [reactor, packageManager, registryUrl],
  );

  const handleUninstall = useCallback(
    (packageId: string) => {
      if (reactor !== LOCAL_REACTOR_VALUE) {
        throw new Error("Cannot delete external package on a remote reactor");
      }
      const pkg = packagesInfo.find((pkg) => pkg.id === packageId);
      if (!pkg) {
        throw new Error(`Package wiht id ${packageId} not found`);
      }
      packageManager?.removePackage(pkg.name).catch((error) => {
        console.error(error);
      });
    },
    [reactor, packageManager, packagesInfo],
  );

  return (
    <PackageManager
      mutable={true}
      reactorOptions={reactorOptions ?? []}
      reactor={reactor}
      packages={packagesInfo.map((pkg) => ({
        id: pkg.id,
        name: pkg.name,
        description: pkg.description,
        category: pkg.category,
        publisher: pkg.author.name,
        publisherUrl: pkg.author.website ?? "",
        modules: Object.values(pkg.modules).flatMap((modules) =>
          modules.map((module) => module.name),
        ),
        removable: true,
      }))}
      onReactorChange={handleReactorChange}
      onInstall={handleInstall}
      onUninstall={handleUninstall}
      packageOptions={PH_PACKAGES}
    />
  );
};
