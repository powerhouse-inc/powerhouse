import type { AppOptions } from "@powerhousedao/design-system/connect";
import type { DocumentModelLib, EditorModule, Manifest } from "document-model";

// Create Drive picker order: installed/custom apps first (rank 0), then the
// generic explorer, then the vetra drive app last.
const DRIVE_APP_RANK: Record<string, number> = {
  GenericDriveExplorer: 1,
  "vetra-drive-app": 2,
};

const POWERHOUSE_SCOPE = "@powerhousedao";

/** Who built a package's apps: its publisher, else its name; Powerhouse for
 * Powerhouse's own packages. */
export function appPublisher(manifest: Manifest | undefined) {
  const publisher = manifest?.publisher?.name?.trim();
  const name = manifest?.name.trim();
  if (publisher === POWERHOUSE_SCOPE) return "Powerhouse";
  if (publisher) return publisher;
  if (!name || name.startsWith(`${POWERHOUSE_SCOPE}/`)) return "Powerhouse";
  return name;
}

export function getCreateDriveAppOptions(
  appModules: EditorModule[] | undefined,
  packages: readonly DocumentModelLib[] = [],
): AppOptions[] {
  if (!appModules?.length) {
    return [];
  }

  return appModules
    .map((module) => ({
      id: module.config.id,
      name: module.config.name,
      builtBy: appPublisher(
        packages.find((pkg) => pkg.editors.includes(module))?.manifest,
      ),
      sharingType: "LOCAL" as const,
      availableOffline: false,
    }))
    .sort((a, b) => (DRIVE_APP_RANK[a.id] ?? 0) - (DRIVE_APP_RANK[b.id] ?? 0));
}
