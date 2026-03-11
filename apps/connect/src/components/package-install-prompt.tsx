import { PackageInstallModal } from "@powerhousedao/design-system/connect";
import {
  type BrowserPackageManager,
  usePendingInstallations,
  useVetraPackageManager,
} from "@powerhousedao/reactor-browser";
import React, { useCallback } from "react";
import { toast } from "../services/toast.js";

export const PackageInstallPrompt: React.FC = () => {
  const packageManager = useVetraPackageManager() as
    | BrowserPackageManager
    | undefined;
  const pending = usePendingInstallations();

  const handleInstall = useCallback(
    async (packageName: string) => {
      if (!packageManager) return;
      try {
        await packageManager.approveInstallation(packageName);
        toast(`Package "${packageName}" installed successfully`, {
          type: "connect-success",
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        toast(`Failed to install "${packageName}": ${message}`, {
          type: "error",
        });
      }
    },
    [packageManager],
  );

  const handleDismiss = useCallback(
    (packageName: string) => {
      if (!packageManager) return;
      packageManager.rejectInstallation(packageName);
    },
    [packageManager],
  );

  if (pending.length === 0) return null;

  return (
    <PackageInstallModal
      pendingInstallations={pending}
      onInstall={handleInstall}
      onDismiss={handleDismiss}
    />
  );
};
