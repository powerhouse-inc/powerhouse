import { useRegistryPackages } from "@powerhousedao/connect/hooks";
import {
  PackageInstallModal,
  type PendingPackageInstallation,
} from "@powerhousedao/design-system/connect";
import {
  closePHModal,
  usePHModal,
  useVetraPackageManager,
} from "@powerhousedao/reactor-browser";
import type { RegistryPackage } from "@powerhousedao/shared/registry";
import { useEffect, useState } from "react";

export function ConnectMissingPackageModal() {
  const phModal = usePHModal();
  const { updateRegistryPackageStatus, fetchPackagesByDocumentType } =
    useRegistryPackages();
  const packageManager = useVetraPackageManager();
  const open = phModal?.type === "missingPackage";

  const documentType = open ? phModal.documentType : undefined;

  const [matches, setMatches] = useState<RegistryPackage[]>([]);

  // The full registry listing is paginated and not loaded up front, so this
  // modal fetches just the packages that provide the missing document type
  // (targeted `?documentType=` query). The callback's identity changes when
  // the package manager arrives, re-running until the fetch can proceed.
  useEffect(() => {
    if (!documentType) return;
    let cancelled = false;
    void fetchPackagesByDocumentType(documentType).then((pkgs) => {
      if (!cancelled) setMatches(pkgs);
    });
    return () => {
      cancelled = true;
    };
  }, [documentType, fetchPackagesByDocumentType]);

  if (!packageManager || !documentType) return null;

  // Filter to the current document type: guards against a stale result set
  // from a previous open while the new fetch is in flight.
  const pendingInstallations: PendingPackageInstallation[] = matches
    .filter((rp) => rp.documentTypes.includes(documentType))
    .map((rp) => ({
      documentType,
      packageName: rp.name,
    }));

  async function onInstall(packageName: string) {
    const result = await packageManager?.addPackage(packageName);
    if (result?.type === "success") {
      updateRegistryPackageStatus(packageName, "registry-install");
    }
  }

  function onDismiss(packageName: string) {
    updateRegistryPackageStatus(packageName, "dismissed");
  }

  return (
    <PackageInstallModal
      pendingInstallations={pendingInstallations}
      onInstall={onInstall}
      onDismiss={onDismiss}
      onOpenChange={(status: boolean) => {
        if (!status) return closePHModal();
      }}
    />
  );
}
