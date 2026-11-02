import type { SwitchboardDriveDocumentType } from "../types.js";

/** `PH_DEFAULT_DRIVE_TYPE`: the default drive's container type. */
export function parseDriveType(
  raw: string | undefined,
): SwitchboardDriveDocumentType | undefined {
  if (!raw) return undefined;
  if (raw === "powerhouse/document-drive" || raw === "powerhouse/reactor-drive")
    return raw;
  throw new Error(
    `Invalid PH_DEFAULT_DRIVE_TYPE: ${raw}. Expected "powerhouse/document-drive" or "powerhouse/reactor-drive".`,
  );
}
