/**
 * Drive management — find or create drives on startup.
 */

import type { IReactorClient } from "@powerhousedao/reactor";
import type { PHBaseState, PHDocument } from "document-model";
import type { DriveConfig, ReactorClientModule } from "./types.js";

const DRIVE_DOCUMENT_TYPE = "powerhouse/document-drive" as const;

/**
 * Ensure a drive exists, matching by name. On first run, creates a new drive.
 * On subsequent runs, finds the existing one by name.
 *
 * Works on a client alone, embedded or remote: drives are documents of type
 * `powerhouse/document-drive`, listed with `client.find({ type })`, built
 * with `client.newDocument()` and created, already named, with one
 * `client.write.create()`. Those three are what both the embedded
 * `IReactorClient` and `GraphQLReactorClient` (which has no
 * `write.createEmpty` or `write.rename`) offer.
 *
 * @param client - The reactor client the drive is looked up and created with
 * @param driveConfig - Optional drive name/icon configuration and hooks
 * @returns The drive ID and name; `deferred` (and id '') when `canCreate`
 *   held back a drive that does not exist yet
 */
export async function ensureDrive(
  client: IReactorClient,
  driveConfig?: DriveConfig,
): Promise<{ id: string; name: string; deferred?: boolean }> {
  const driveName = driveConfig?.name ?? "default";
  const wantedId = driveConfig?.id;
  const preferredEditor = driveConfig?.preferredEditor;

  // A host-resolved id (e.g. a pointer to a drive created earlier) wins.
  const resolved = await driveConfig?.resolveId?.(client);
  if (resolved) return { id: resolved, name: driveName };

  const matchByName = driveConfig?.matchByName !== false;
  const existing =
    wantedId || matchByName ? await findDrives(client) : ([] as PHDocument[]);
  if (existing.length) {
    // If a deterministic ID was requested, check if it already exists
    if (wantedId) {
      const match = existing.find((doc) => doc.header.id === wantedId);
      if (match) return { id: wantedId, name: driveName };
    }

    // Match by name
    for (const doc of matchByName ? existing : []) {
      const named = doc as unknown as {
        name?: string;
        header?: { name?: string };
        state?: { global?: { name?: string } };
      };
      const docName =
        named.name ?? named.header?.name ?? named.state?.global?.name;
      if (docName === driveName) {
        return { id: doc.header.id, name: driveName };
      }
    }
    // No name match — if default name and single drive, use it
    if (matchByName && driveName === "default" && existing.length === 1) {
      return { id: existing[0].header.id, name: driveName };
    }
  }

  if (driveConfig?.canCreate && !driveConfig.canCreate()) {
    return { id: "", name: driveName, deferred: true };
  }

  // Create the drive in one write, named in its global state and on its
  // header, as the switchboard's default drives
  // (apps/switchboard/src/utils.mts:181-201) and Connect's addDrive
  // (packages/reactor-browser/src/actions/drive.ts:143-184) are. `name` and
  // `meta` are mutable header fields, outside the derived id and header
  // signature of a v2-required drive. Only a legacy drive can take a chosen id.
  const doc = await client.newDocument(DRIVE_DOCUMENT_TYPE, {
    initialState: { global: { name: driveName } } as Partial<PHBaseState>,
    ...(wantedId ? { signaturePolicy: "legacy" as const, id: wantedId } : {}),
  });
  doc.header.name = driveName;
  if (preferredEditor) {
    doc.header.meta = { ...doc.header.meta, preferredEditor };
  }
  const created = await (await client.write.create(doc)).document();
  const driveId = created.header.id;

  await driveConfig?.onCreated?.(driveId);
  return { id: driveId, name: driveName };
}

/** Every drive document the client serves, across result pages. */
async function findDrives(client: IReactorClient): Promise<PHDocument[]> {
  const drives: PHDocument[] = [];
  let page = await client.find({ type: DRIVE_DOCUMENT_TYPE });
  drives.push(...page.results);
  while (page.next) {
    page = await page.next();
    drives.push(...page.results);
  }
  return drives;
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
      await (await client.write.rename(driveId, name)).document();
    } catch {
      // Rename may fail for remote drives — non-fatal
    }
  }

  return { id: driveId, name };
}
