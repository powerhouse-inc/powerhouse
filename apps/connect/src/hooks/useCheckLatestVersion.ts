import { ReloadConnectToast } from "@powerhousedao/connect/components/toast/reload-connect-toast";
import { connectConfig } from "@powerhousedao/connect/config";
import { isLatestVersion } from "@powerhousedao/connect/hooks/utils";
import { toast } from "@powerhousedao/connect/services/toast";
import { logger } from "document-drive";
import { createElement, useEffect } from "react";

export const useCheckLatestVersion = () => {
  async function checkLatestVersion() {
    const result = await isLatestVersion();
    if (result === null) return;
    // ignore dev/staging versions
    if (result.isLatest || result.currentVersion.includes("-")) {
      return true;
    }

    if (
      import.meta.env.MODE === "development" ||
      connectConfig.studioMode ||
      !connectConfig.warnOutdatedApp
    ) {
      logger.warn(
        `Connect is outdated: \nCurrent: ${result.currentVersion}\nLatest: ${result.latestVersion}`,
      );
    } else {
      toast(createElement(ReloadConnectToast), {
        type: "connect-warning",
        toastId: "outdated-app",
        autoClose: false,
      });
    }
  }

  useEffect(() => {
    checkLatestVersion().catch(console.error);
  }, []);
};
