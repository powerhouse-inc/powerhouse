import {
  DEFAULT_DRIVE_ICON,
  type PHSwitchboardDriveConfig,
} from "@powerhousedao/shared/clis";

/** The first value that is set; empty and blank count as unset. */
function first(...values: (string | undefined)[]): string | undefined {
  return values.map((value) => value?.trim()).find((value) => !!value);
}

/** The drive the switchboard creates at boot: today's drive, then
 * powerhouse.config.json `switchboard.drive`, then the PH_DEFAULT_DRIVE_*
 * env vars. Only a new drive gets these values (see addDefaultDrive). */
export function defaultDrive(
  env: Readonly<Record<string, string | undefined>>,
  fileDrive: PHSwitchboardDriveConfig = {},
) {
  const id = first(env.PH_DEFAULT_DRIVE_ID, fileDrive.id) ?? "powerhouse";
  const preferredEditor = first(
    env.PH_DEFAULT_DRIVE_PREFERRED_EDITOR,
    fileDrive.preferredEditor,
  );
  return {
    id,
    slug: first(env.PH_DEFAULT_DRIVE_SLUG, fileDrive.slug) ?? id,
    global: {
      name: first(env.PH_DEFAULT_DRIVE_NAME, fileDrive.name) ?? "Powerhouse",
      icon:
        first(env.PH_DEFAULT_DRIVE_ICON, fileDrive.icon) ?? DEFAULT_DRIVE_ICON,
    },
    ...(preferredEditor ? { preferredEditor } : {}),
    local: {
      availableOffline: true,
      listeners: [],
      sharingType: "public" as const,
      triggers: [],
    },
  };
}
