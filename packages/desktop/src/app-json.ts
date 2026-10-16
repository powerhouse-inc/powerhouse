import fs from "node:fs";
import path from "node:path";
import { z } from "zod";

/**
 * `hosts/desktop/app.json` — the builder's desktop identity (phase 7, mode 1:
 * the builder ships under THEIR identity without writing Rust). It is the ONE
 * file a builder edits; `shell-project.ts` projects it into a generated
 * `tauri-shell/` that depends on the published `ph-desktop-shell` crate. Every
 * field validates strictly so a typo fails with the field named, not silently.
 */

const identifierSchema = z
  .string()
  .min(1)
  .regex(
    /^[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/,
    "identifier must be reverse-DNS (e.g. com.acme.app): dot-separated alphanumeric segments",
  );

const windowSchema = z
  .strictObject({
    title: z.string().min(1).optional(),
    width: z.number().int().positive().optional(),
    height: z.number().int().positive().optional(),
    resizable: z.boolean().optional(),
    /** Smallest size the window can be dragged to (logical pixels). */
    minWidth: z.number().int().positive().optional(),
    minHeight: z.number().int().positive().optional(),
  })
  .optional();

const cssColorSchema = z
  .string()
  .regex(
    /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/,
    "use a hex color (#rgb, #rgba, #rrggbb or #rrggbbaa)",
  );

/** The loading page's look, so the window opens in the app's own colors
 * instead of the default dark page. Every field is optional. */
const loadingSchema = z
  .strictObject({
    /** Page background (default #0f1115). */
    background: cssColorSchema.optional(),
    /** Status text color (default #e6e8eb). */
    color: cssColorSchema.optional(),
    /** The pulsing status dot (default #4ade80). */
    accent: cssColorSchema.optional(),
    /** Status line under the art (default "Starting <productName>…"). */
    message: z.string().min(1).optional(),
  })
  .optional();

const fileAssociationSchema = z.strictObject({
  /** Extensions WITHOUT the leading dot ("phd", not ".phd"). */
  ext: z.array(z.string().min(1).regex(/^[^.]/, "drop the leading dot")).min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  mimeType: z.string().optional(),
});

/** Where the generated Cargo.toml resolves `ph-desktop-shell` from. Default
 * (omitted) = the published crates.io version. */
const shellSourceSchema = z
  .strictObject({
    /** Local checkout for shell development (the lab points here). */
    path: z.string().min(1).optional(),
    /** Git source, pinned to a tag/rev, for pre-publication consumption. */
    git: z.string().min(1).optional(),
    tag: z.string().min(1).optional(),
    rev: z.string().min(1).optional(),
    /** crates.io version requirement (default DEFAULT_SHELL_CRATE_VERSION). */
    version: z.string().min(1).optional(),
  })
  .refine((s) => !(s.path && s.git), {
    message: "shell.source: set path OR git, not both",
  })
  .optional();

export const appJsonSchema = z.strictObject({
  identifier: identifierSchema,
  productName: z.string().min(1),
  /** Single source image (square PNG, 1024×1024 recommended); the icon set
   * for every platform is generated from it via `tauri icon`. */
  icon: z.string().min(1),
  /** Optional wide splash image (e.g. 2048x1152, transparent PNG) for the
   * loading page, shown instead of the square icon. Relative to this file. */
  splash: z.string().min(1).optional(),
  loading: loadingSchema,
  window: windowSchema,
  fileAssociations: z.array(fileAssociationSchema).optional(),
  shell: shellSourceSchema,
});

export type AppJson = z.infer<typeof appJsonSchema>;
export type AppJsonShellSource = NonNullable<AppJson["shell"]>;

/** Default crates.io version requirement for the shell crate (D7.b: the flip
 * to crates.io default once published — the crate is live). */
export const DEFAULT_SHELL_CRATE_VERSION = "0.1";

export const APP_JSON_FILE = "app.json";

/** Read + validate hosts/<host>/app.json. Throws with the field named on a
 * bad value, and a clear message when the file is absent. */
export function loadAppJson(hostDir: string): AppJson {
  const file = path.join(hostDir, APP_JSON_FILE);
  if (!fs.existsSync(file)) {
    throw new Error(
      `No ${APP_JSON_FILE} in ${hostDir} — run \`ph generate desktop-shell\` to scaffold the builder identity, or set runner.shell.project to a prebuilt shell.`,
    );
  }
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    throw new Error(`${file}: not valid JSON — ${String(error)}`, {
      cause: error,
    });
  }
  const result = appJsonSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(`${file} is invalid:\n${issues}`);
  }
  return result.data;
}

/** A filesystem/crate-safe slug of the product name — the generated binary
 * and Cargo package name. Falls back to the identifier's last segment. */
export function appSlug(app: AppJson): string {
  const fromName = app.productName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (fromName) return fromName;
  const seg = app.identifier.split(".").pop() ?? "app";
  return seg.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}
