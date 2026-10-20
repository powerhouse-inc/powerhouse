import type { AppOptions } from "@powerhousedao/design-system/connect";
import type { EditorModule } from "document-model";

// Create Drive picker order: installed/custom apps first (rank 0), then the
// generic explorer, then the vetra drive app last.
const DRIVE_APP_RANK: Record<string, number> = {
  GenericDriveExplorer: 1,
  "vetra-drive-app": 2,
};

export function getCreateDriveAppOptions(
  appModules: EditorModule[] | undefined,
): AppOptions[] {
  if (!appModules?.length) {
    return [];
  }

  return appModules
    .map((pkg) => ({
      id: pkg.config.id,
      name: pkg.config.name,
      sharingType: "LOCAL" as const,
      availableOffline: false,
    }))
    .sort((a, b) => (DRIVE_APP_RANK[a.id] ?? 0) - (DRIVE_APP_RANK[b.id] ?? 0));
}
