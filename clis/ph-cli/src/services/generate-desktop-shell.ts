import fs from "node:fs";
import path from "node:path";
import { scaffoldDesktopShell } from "@powerhousedao/desktop";

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
  const result = scaffoldDesktopShell(hostDir, {
    identifier,
    productName,
    force: args.force,
  });

  const rel = (p: string) => path.relative(cwd, p).replace(/\\/g, "/");
  for (const f of result.created) console.log(`  created  ${rel(f)}`);
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
