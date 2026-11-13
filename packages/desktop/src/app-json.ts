import type { PHBackground } from "@powerhousedao/shared/clis";
import { validateBackground } from "@powerhousedao/shared/connect";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { FEED_FILE_TEMPLATE } from "./release.js";

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

/** The loading page's colors. */
const loadingColorsSchema = z.strictObject({
  /** Page background (default #0f1115). */
  background: cssColorSchema.nullable().optional(),
  /** Status text color (default #e6e8eb). */
  color: cssColorSchema.nullable().optional(),
  /** The pulsing status dot (default #4ade80). */
  accent: cssColorSchema.nullable().optional(),
});

/** The loading page's look, so the window opens in the app's own colors
 * instead of the default dark page. Every field is optional, and `null`
 * means the default (the scaffold lists the fields that way). */
const loadingSchema = loadingColorsSchema
  .extend({
    /** Status line under the art (default "Starting <productName>…"). */
    message: z.string().min(1).nullable().optional(),
    /** Colors for `prefers-color-scheme: dark`; without it the page keeps
     * the light colors in both schemes. */
    dark: loadingColorsSchema.nullable().optional(),
    /** Deprecated: a decoration pinned to the bottom-right corner, relative
     * to app.json, with `artDark` its dark-scheme counterpart. Superseded by
     * the top-level `background`, which ignores these when set. */
    art: z.string().min(1).nullable().optional(),
    artDark: z.string().min(1).nullable().optional(),
  })
  .nullable()
  .optional();

// The loading page's background: the same `PHBackground` as Connect's
// `connect.branding.homeBackground` (shared/clis/types.ts), so the scaffold
// can copy one into the other and both pages place their art alike. Paths
// are relative to app.json; URLs and data URIs pass through.
const imageRefSchema = z.string().min(1);
const schemedImageSchema = z.union([
  imageRefSchema,
  z.strictObject({
    light: imageRefSchema,
    dark: imageRefSchema.nullable().optional(),
  }),
]);
const lengthSchema = z
  .union([z.number(), z.string().min(1)])
  .nullable()
  .optional();
const edgesSchema = z
  .strictObject({
    top: lengthSchema,
    right: lengthSchema,
    bottom: lengthSchema,
    left: lengthSchema,
  })
  .nullable()
  .optional();
const backgroundLayerSchema = z.strictObject({
  src: schemedImageSchema,
  position: edgesSchema,
  width: lengthSchema,
  height: lengthSchema,
  minWidth: lengthSchema,
  minHeight: lengthSchema,
  maxWidth: lengthSchema,
  maxHeight: lengthSchema,
  opacity: z.number().min(0).max(1).nullable().optional(),
  fade: edgesSchema,
});
const backgroundSchema = z
  .union([
    imageRefSchema,
    z.strictObject({
      color: z
        .union([
          z.string().min(1),
          z.strictObject({
            light: z.string().min(1),
            dark: z.string().min(1).nullable().optional(),
          }),
        ])
        .nullable()
        .optional(),
      layers: z.array(backgroundLayerSchema),
    }),
  ])
  .superRefine((background: PHBackground, ctx) => {
    for (const problem of validateBackground(background, "background")) {
      ctx.addIssue({ code: "custom", message: problem });
    }
  })
  .nullable()
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

/** What is wrong with a release key, or null. The public half is base64 of a
 * minisign public key, as `tauri signer generate` writes its .pub file; the
 * private half looks alike at a glance and must never land in app.json. */
function pubkeyProblem(value: string): string | null {
  const text = Buffer.from(value.trim(), "base64").toString("utf8");
  if (/secret key/i.test(text)) {
    return "this is the PRIVATE key: put the public one here (the .pub file) and keep the private one in your CI secrets";
  }
  if (!/^untrusted comment: minisign public key/i.test(text)) {
    return "not an update signing key: paste the content of the .pub file `tauri signer generate` writes";
  }
  return null;
}

/** An update feed's address: https, as a release build asks nothing else. */
const feedUrlSchema = z.string().refine((value) => {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}, "an update feed must be an https address");

/** Updates, for an app that wants them: where it asks for a newer version and
 * the key its releases are signed with. The window then offers each newer
 * release, downloads it, checks its signature and installs it. Omitted or
 * null: the app never asks, and is installed by hand as before. */
const updatesSchema = z
  .strictObject({
    /** The GitHub repository whose releases carry the app ("owner/name"): the
     * app asks its latest release for the feed file a build of its system
     * wrote (release.ts). */
    github: z
      .string()
      .regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/, 'use "owner/repository"')
      .optional(),
    /** Or the feed's own addresses, asked in order. `{{target}}` and
     * `{{arch}}` in one stand for the running app's system and processor,
     * as in the feed file's name: `latest-{{target}}-{{arch}}.json`. */
    endpoints: z.array(feedUrlSchema).min(1).optional(),
    /** The public key the releases are signed with: the content of the .pub
     * file `tauri signer generate` writes. The private key signs each build
     * (TAURI_SIGNING_PRIVATE_KEY) and stays out of the repository. */
    pubkey: z
      .string()
      .min(1)
      .superRefine((value, ctx) => {
        const problem = pubkeyProblem(value);
        if (problem) ctx.addIssue({ code: "custom", message: problem });
      }),
  })
  .refine((u) => Boolean(u.github) !== Boolean(u.endpoints), {
    message: "updates: set github OR endpoints",
  })
  .nullable()
  .optional();

export const appJsonSchema = z.strictObject({
  identifier: identifierSchema,
  productName: z.string().min(1),
  /** Ask who is using the app before anything runs: the stack then starts for
   * that identity, with its own folder and as its admin. Off, the stack starts
   * with the window, in one store. */
  signIn: z.boolean().nullable().optional(),
  /** Single source image (square PNG, 1024×1024 recommended); the icon set
   * for every platform is generated from it via `tauri icon`. */
  icon: z.string().min(1),
  /** The loading page's background: images positioned and sized over a
   * page colour (`{ color, layers }`), or one image pinned bottom-right.
   * The status line stays centred above them. `ph generate desktop-shell`
   * copies Connect's `connect.branding.homeBackground` here. null or
   * omitted: the app icon (or `splash`) above the status line. */
  background: backgroundSchema,
  /** Deprecated in favour of `background`: a wide splash image shown above
   * the status line instead of the square icon. Relative to this file. */
  splash: z.string().min(1).nullable().optional(),
  /** Deprecated with `splash`: its `prefers-color-scheme: dark` variant. */
  splashDark: z.string().min(1).nullable().optional(),
  loading: loadingSchema,
  window: windowSchema,
  fileAssociations: z.array(fileAssociationSchema).optional(),
  updates: updatesSchema,
  shell: shellSourceSchema,
});

export type AppJson = z.infer<typeof appJsonSchema>;
export type AppJsonShellSource = NonNullable<AppJson["shell"]>;
export type AppJsonUpdates = NonNullable<AppJson["updates"]>;

/** Where an app with updates asks for a newer version. */
export function updateEndpoints(updates: AppJsonUpdates): string[] {
  return (
    updates.endpoints ?? [
      `https://github.com/${updates.github}/releases/latest/download/${FEED_FILE_TEMPLATE}`,
    ]
  );
}

/** Default crates.io version requirement for the shell crate (D7.b: the flip
 * to crates.io default once published — the crate is live). A floor, not just
 * a series: 0.1.0 can't run a stack from ph-run and 0.1.1 has no updater (an
 * app with `updates` would build and never ask), and a Cargo.lock that still
 * holds one of them satisfies "0.1", so a builder's lock would keep it
 * forever. The 0.1.x-dev.N releases sort below 0.1.x and never match either. */
export const DEFAULT_SHELL_CRATE_VERSION = "0.1.2";

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
