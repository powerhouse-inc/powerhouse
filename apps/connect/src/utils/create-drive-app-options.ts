import type { AppOptions } from "@powerhousedao/design-system/connect";
import type { EditorModule } from "document-model";

/** Hidden from the Create Drive picker for now — re-enable when ready. */
const HIDDEN_CREATE_DRIVE_APP_IDS = new Set(["vetra-drive-app"]);

/** Generic explorer; always listed last when other drive apps are available. */
const DEFAULT_DRIVE_EXPLORER_APP_ID = "GenericDriveExplorer";

export function getCreateDriveAppOptions(
  appModules: EditorModule[] | undefined,
): AppOptions[] {
  if (!appModules?.length) {
    return [];
  }

  return appModules
    .filter((pkg) => !HIDDEN_CREATE_DRIVE_APP_IDS.has(pkg.config.id))
    .map((pkg) => ({
      id: pkg.config.id,
      name: pkg.config.name,
      sharingType: "LOCAL" as const,
      availableOffline: false,
    }))
    .sort((a, b) => {
      const aIsDefaultExplorer = a.id === DEFAULT_DRIVE_EXPLORER_APP_ID;
      const bIsDefaultExplorer = b.id === DEFAULT_DRIVE_EXPLORER_APP_ID;
      if (aIsDefaultExplorer === bIsDefaultExplorer) {
        return 0;
      }
      return aIsDefaultExplorer ? 1 : -1;
    });
}
