import { PackageInstallModal } from "@powerhousedao/design-system/connect";
import {
  type BrowserPackageLoader,
  useBrowserPackageLoader,
  usePendingInstallations,
} from "@powerhousedao/reactor-browser";
import React, { useCallback } from "react";
import { toast } from "../services/toast.js";

export const PackageInstallPrompt: React.FC = () => {
  const loader = useBrowserPackageLoader() as BrowserPackageLoader | undefined;
  const pending = usePendingInstallations();

  const handleInstall = useCallback(
    async (packageName: string) => {
      if (!loader) return;
      try {
        await loader.approveInstallation(packageName);
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
    [loader],
  );

  const handleDismiss = useCallback(
    (packageName: string) => {
      if (!loader) return;
      loader.rejectInstallation(packageName);
    },
    [loader],
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
