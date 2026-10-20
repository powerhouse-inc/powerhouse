import { z } from "zod";
import { tokenable, type TokenableSchema } from "./tokens.js";

/**
 * The schema half of drives.ts, zod only so `./schema` stays neutral.
 * - slug: the SEEDING KEY (idempotence); id optional (stable identity).
 * - preferredEditor: stored at header.meta.preferredEditor; Connect config's
 *   `app` is the legacy alias.
 * - remote.url: a drive served elsewhere; local fields are ignored for it.
 *   Token-able (`$output` on a producer's `drives.<slug>.url`).
 */
export function buildDriveDeclarationSchema(
  urlField: (schema: z.ZodString) => TokenableSchema<z.ZodString>,
) {
  return z.strictObject({
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
    remote: z.strictObject({ url: urlField(z.string().min(1)) }).optional(),
  });
}

export const driveDeclarationSchema = buildDriveDeclarationSchema(tokenable);

export type DriveDeclaration = z.infer<typeof driveDeclarationSchema>;

export const drivesSchema = z.array(driveDeclarationSchema);

/** The project-hashed drive id (`${slug}-${sha256(projectRoot)[0..8]}`) with
 * the hash function injected, so neutral consumers (a browser monitor) can
 * pass `crypto.subtle`-derived or precomputed hex. drives.ts binds it to
 * node:crypto as `projectDriveId`. */
export function projectDriveIdWith(
  sha256Hex: (input: string) => string,
  projectRoot: string,
  slug: string,
): string {
  return `${slug}-${sha256Hex(projectRoot).substring(0, 8)}`;
}
