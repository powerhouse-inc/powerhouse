import fs from "node:fs";
import path from "node:path";
import { rebaseBackground, scaffoldDesktopShell } from "@powerhousedao/desktop";
import type { PHBackground } from "@powerhousedao/shared/clis";

export interface GenerateDesktopShellArgs {
  name?: string;
  identifier?: string;
  force?: boolean;
}

/** A reverse-DNS-safe segment from the project name (drop scope, slugify). */
function projectSlug(pkgName: string | undefined): string {
  const bare = (pkgName ?? "app").replace(/^@[^/]+\//, "");
  const seg = bare
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return seg || "app";
}

/** `connect.home.background` of the project's powerhouse.config.json, if
 * any (absent or unreadable config: none). */
function readHomeBackground(cwd: string): PHBackground | null {
  try {
    const config = JSON.parse(
      fs.readFileSync(path.join(cwd, "powerhouse.config.json"), "utf8"),
    ) as { connect?: { home?: { background?: PHBackground | null } } };
    return config.connect?.home?.background ?? null;
  } catch {
    return null;
  }
}

/** `ph generate desktop-shell`: write hosts/desktop/app.json + a placeholder
 * icon + .gitignore. Defaults product name / identifier from the project. */
export function startGenerateDesktopShell(
  args: GenerateDesktopShellArgs,
  cwd: string,
): void {
  let pkgName: string | undefined;
  try {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(cwd, "package.json"), "utf8"),
    ) as { name?: string };
    pkgName = pkg.name;
  } catch {
    // no package.json — fall back to defaults below
  }
  const slug = projectSlug(pkgName);
  const productName = args.name ?? pkgName?.replace(/^@[^/]+\//, "") ?? "App";
  const identifier = args.identifier ?? `inc.powerhouse.desktop.${slug}`;

  const hostDir = path.join(cwd, "hosts", "desktop");
  // The loading page takes Connect's home background, the same layers in
  // the same places, with its paths rebased from the project root to
  // hosts/desktop (app.json resolves them from where it lives).
  const homeBackground = readHomeBackground(cwd);
  const result = scaffoldDesktopShell(hostDir, {
    identifier,
    productName,
    force: args.force,
    background: homeBackground
      ? rebaseBackground(homeBackground, cwd, hostDir)
      : null,
  });

  const rel = (p: string) => path.relative(cwd, p).replace(/\\/g, "/");
  for (const f of result.created) console.log(`  created  ${rel(f)}`);
  if (homeBackground && result.created.some((f) => f.endsWith("app.json"))) {
    console.log(
      "  copied   connect.home.background -> hosts/desktop/app.json background",
    );
  }
  for (const f of result.skipped) {
    console.log(`  skipped  ${rel(f)} (exists — pass --force to overwrite)`);
  }
  if (!fs.existsSync(path.join(hostDir, "host.js"))) {
    console.log(
      `\nNote: hosts/desktop/host.js not found. Add a desktop host (see the ` +
        `desktop topology from \`ph init\`) so \`ph run desktop\` can supervise ` +
        `the stack; app.json then gives it a native window.`,
    );
  }
  console.log(
    `\nIdentity: ${productName} (${identifier}).\n` +
      `• Replace hosts/desktop/icon.png with your 1024×1024 icon.\n` +
      `• \`ph run desktop dev\` opens the native window (needs Rust + the Tauri CLI).\n` +
      `• \`ph run desktop build\` produces installers for this OS.`,
  );
}
