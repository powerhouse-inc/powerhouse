import {
  PackageInstallModal,
  type PendingPackageInstallation,
} from "@powerhousedao/design-system/connect/index";
import { usePackageDiscoveryService } from "@powerhousedao/reactor-browser";
import { usePendingInstallations } from "../hooks/usePendingInstallations.js";

export function PackageInstallPrompt() {
  const pendingInstallations = usePendingInstallations();
  const discoveryService = usePackageDiscoveryService();

  if (!discoveryService || pendingInstallations.length === 0) return null;

  const installations: PendingPackageInstallation[] =
    pendingInstallations.flatMap((p) =>
      p.packageNames.map((packageName) => ({
        documentType: p.documentType,
        packageName,
      })),
    );

  return (
    <PackageInstallModal
      pendingInstallations={installations}
      onInstall={(packageName) =>
        discoveryService.approveInstallation(packageName)
      }
      onDismiss={(packageName) =>
        discoveryService.dismissInstallation(packageName)
      }
    />
  );
}
