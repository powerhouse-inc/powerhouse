/**
 * Drive management — find or create drives on startup.
 */

import type { DriveConfig, ReactorClientModule } from "./types.js";

const DRIVE_DOCUMENT_TYPE = "powerhouse/document-drive" as const;

/**
 * Ensure a drive exists, matching by name. On first run, creates a new drive.
 * On subsequent runs, finds the existing one by name.
 *
 * The Reactor client has no `getDrives()` — drives are documents of type
 * `powerhouse/document-drive`. We use `reactor.findByType()` to locate
 * existing ones and `client.createEmpty()` + `client.rename()` to create.
 *
 * @param reactorModule - The full ReactorClientModule (needs .client and .reactor)
 * @param driveConfig - Optional drive name/icon configuration
 * @returns The drive ID and name
 */
export async function ensureDrive(
  reactorModule: ReactorClientModule,
  driveConfig?: DriveConfig,
): Promise<{ id: string; name: string }> {
  const { client, reactor } = reactorModule;
  const driveName = driveConfig?.name ?? "default";
  const wantedId = driveConfig?.id;
  const preferredEditor = driveConfig?.preferredEditor;

  // Find existing document-drive documents
  const existing = await reactor.findByType(DRIVE_DOCUMENT_TYPE);
  if (existing?.results?.length) {
    // If a deterministic ID was requested, check if it already exists
    if (wantedId) {
      const match = existing.results.find((r) => r.header.id === wantedId);
      if (match) return { id: wantedId, name: driveName };
    }

    // Match by name — load each to check
    for (const result of existing.results) {
      const doc = (await client.get(result.header.id)) as any;
      const docName = doc.name ?? doc.header?.name ?? doc.state?.global?.name;
      if (docName === driveName) {
        return { id: result.header.id, name: driveName };
      }
    }
    // No name match — if default name and single drive, use it
    if (driveName === "default" && existing.results.length === 1) {
      return { id: existing.results[0].header.id, name: driveName };
    }
  }

  // Create a new drive document. Goes through the doc-build path when a
  // deterministic id or preferredEditor is set so we can populate the
  // header before persistence; falls back to createEmpty otherwise.
  let driveId: string;
  if (wantedId || preferredEditor) {
    // Only a legacy drive can take a chosen id.
    const doc = await client.newDocument(
      DRIVE_DOCUMENT_TYPE,
      wantedId ? { signaturePolicy: "legacy", id: wantedId } : undefined,
    );
    if (preferredEditor) doc.header.meta = { preferredEditor };
    const created = await client.create(doc);
    driveId = (created as any).header.id;
  } else {
    const drive = await client.createEmpty(DRIVE_DOCUMENT_TYPE);
    driveId = drive.header.id;
  }

  await client.rename(driveId, driveName);
  return { id: driveId, name: driveName };
}

/**
 * Ensure a remote drive is connected for watching.
 * Uses the reactor client's addRemoteDrive capability.
 *
 * @param reactorModule - The full ReactorClientModule
 * @param url - The Switchboard URL to sync from
 * @param name - Display name for the drive
 * @returns The drive ID and name
 */
export async function ensureRemoteDrive(
  reactorModule: ReactorClientModule,
  url: string,
  name: string,
): Promise<{ id: string; name: string }> {
  const { client } = reactorModule;

  // addRemoteDrive is idempotent — calling again for the same URL
  // returns the existing drive
  const result = await (client as any).addRemoteDrive(url);
  const driveId = result.header?.id ?? result.id;

  if (name) {
    try {
      await client.rename(driveId, name);
    } catch {
      // Rename may fail for remote drives — non-fatal
    }
  }

  return { id: driveId, name };
}
