import crypto from "node:crypto";
import {
  DRIVE_ICON_MAX_BYTES,
  resolveImageRef,
} from "@powerhousedao/shared/connect/image-ref";
import { z } from "zod";

/**
 * R1 — core drive declarations. A reactor without drives is not a running
 * reactor, so declaring + seeding them is HOST RUNTIME work (not a plugin):
 * onReactorReady → idempotent slug-keyed seeding → onDrivesReady. Plugins
 * CONTRIBUTE declarations into the same merged list (Contributions.drives);
 * `--explain drives` prints the merged set with provenance.
 *
 * Field semantics (union of the three existing creation sites — vetra,
 * preview, workflows — plus Connect's PHConnectDefaultDrive):
 * - slug: the SEEDING KEY (idempotence); id optional (stable identity),
 *   projectHash derives both from the project path (generateProjectDriveId
 *   semantics: `${slug}-${sha256(projectPath).slice(0, 8)}`).
 * - preferredEditor: binds the drive to its drive app — stored at
 *   header.meta.preferredEditor; Connect config's `app` is the legacy alias.
 * - remote.url: an attachment to a drive served elsewhere (Connect default
 *   drives, switchboard remoteDrives); local fields are ignored for remotes.
 */

export const driveDeclarationSchema = z.strictObject({
  slug: z.string().min(1),
  id: z.string().min(1).optional(),
  /** Derive the id from the project path, like generateProjectDriveId — the
   * same ids classic `ph vetra` produces. `true` serves the drive under the
   * hashed slug too (the vetra drive's slug IS its hashed id); `"id"` hashes
   * only the id and keeps the declared slug (the classic Workflows drive:
   * `/d/workflows`, id `workflows-<hash>`). */
  projectHash: z.union([z.boolean(), z.literal("id")]).optional(),
  name: z.string().min(1).optional(),
  icon: z.string().optional(),
  preferredEditor: z.string().optional(),
  sharingType: z.enum(["public", "private", "shared"]).optional(),
  availableOffline: z.boolean().optional(),
  remote: z.strictObject({ url: z.string().min(1) }).optional(),
});

export type DriveDeclaration = z.infer<typeof driveDeclarationSchema>;

export const drivesSchema = z.array(driveDeclarationSchema);

export function projectDriveId(projectRoot: string, slug: string): string {
  const hash = crypto
    .createHash("sha256")
    .update(projectRoot)
    .digest("hex")
    .substring(0, 8);
  return `${slug}-${hash}`;
}

export interface ResolvedDrive {
  kind: "local" | "remote";
  id: string;
  slug: string;
  name: string;
  icon?: string;
  preferredEditor?: string;
  sharingType: "public" | "private" | "shared";
  availableOffline: boolean;
  remoteUrl?: string;
}

export function resolveDriveDeclaration(
  projectRoot: string,
  decl: DriveDeclaration,
): ResolvedDrive {
  const id = decl.projectHash
    ? projectDriveId(projectRoot, decl.slug)
    : (decl.id ?? decl.slug);
  // Hash-derived drives serve under the hashed slug too (classic parity:
  // the vetra drive's slug IS its hashed id) — unless only the id is hashed.
  const slug = decl.projectHash === true ? id : decl.slug;
  if (decl.remote) {
    return {
      kind: "remote",
      id,
      slug,
      name: decl.name ?? decl.slug,
      remoteUrl: decl.remote.url,
      sharingType: decl.sharingType ?? "public",
      availableOffline: decl.availableOffline ?? true,
    };
  }
  return {
    kind: "local",
    id,
    slug,
    name: decl.name ?? decl.slug,
    // A project path becomes a data URI here (the icon lives in synced drive
    // state, so it is size-capped); URLs and data URIs pass through.
    icon: resolveImageRef(projectRoot, decl.icon, {
      maxBytes: DRIVE_ICON_MAX_BYTES,
      warn: (m) => console.warn(m),
    }),
    preferredEditor: decl.preferredEditor,
    sharingType: decl.sharingType ?? "public",
    availableOffline: decl.availableOffline ?? true,
  };
}

/* ------------------------------------------------------------------ seeding */

/** The minimal client surface the seeder needs — runners adapt their reactor
 * clients (IReactorClient, addDefaultDrive-style helpers) onto it. */
export interface DriveSeederClient {
  /** Return the existing drive's id for a slug, or undefined. */
  findDriveBySlug(slug: string): Promise<string | undefined>;
  /** Create a local drive; preferredEditor lands on header.meta. */
  createDrive(drive: ResolvedDrive): Promise<void>;
  /** Attach a remote drive by URL (idempotent on the client side). */
  attachRemoteDrive(url: string): Promise<void>;
}

export interface SeedResult {
  created: string[];
  existing: string[];
  attached: string[];
}

/** Idempotent, slug-keyed: an existing slug is left untouched (never
 * recreated, never mutated — preserveStrategy refinements live here later). */
export async function seedDrives(
  client: DriveSeederClient,
  drives: readonly ResolvedDrive[],
): Promise<SeedResult> {
  const result: SeedResult = { created: [], existing: [], attached: [] };
  for (const drive of drives) {
    if (drive.kind === "remote") {
      await client.attachRemoteDrive(drive.remoteUrl!);
      result.attached.push(drive.slug);
      continue;
    }
    const existing = await client.findDriveBySlug(drive.slug);
    if (existing !== undefined) {
      result.existing.push(drive.slug);
      continue;
    }
    await client.createDrive(drive);
    result.created.push(drive.slug);
  }
  return result;
}

/* ------------------------------------------------------------------ explain */

export interface DrivePlanEntry {
  drive: ResolvedDrive;
  /** "host" for host.js declarations; a plugin name for contributions. */
  source: string;
}

/** Merge host-declared drives with plugin contributions, slug-keyed — the
 * host file wins on conflicts (it is the most explicit source). */
export function mergeDrivePlan(
  projectRoot: string,
  hostDeclared: readonly DriveDeclaration[],
  contributed: readonly { declaration: DriveDeclaration; source: string }[],
): DrivePlanEntry[] {
  const plan = new Map<string, DrivePlanEntry>();
  for (const { declaration, source } of contributed) {
    const drive = resolveDriveDeclaration(projectRoot, declaration);
    plan.set(drive.slug, { drive, source });
  }
  for (const declaration of hostDeclared) {
    const drive = resolveDriveDeclaration(projectRoot, declaration);
    plan.set(drive.slug, { drive, source: "host" });
  }
  return [...plan.values()];
}

export function explainDrivePlan(plan: readonly DrivePlanEntry[]): string {
  if (plan.length === 0) return "(no drives declared)";
  const lines = plan.map(({ drive, source }) => {
    const kind =
      drive.kind === "remote" ? `remote ${drive.remoteUrl}` : "local";
    const editor = drive.preferredEditor
      ? ` editor=${drive.preferredEditor}`
      : "";
    return `  ${drive.slug}  (${kind}, id=${drive.id}${editor})  [${source}]`;
  });
  return ["drives:", ...lines].join("\n");
}
