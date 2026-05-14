import { execSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { REGISTRY_URL, createTestUser } from "@powerhousedao/e2e-utils";
import { WORKSPACE_PUBLISH_PACKAGES } from "./lib/workspace-packages.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const WORKSPACE_ROOT = path.resolve(ROOT, "../..");

const PUBLISH_FILTERS = WORKSPACE_PUBLISH_PACKAGES;

async function main(): Promise<void> {
  console.log(`\n=== publish-workspace → ${REGISTRY_URL} ===\n`);
  console.log(`Publishing ${PUBLISH_FILTERS.length} workspace packages.\n`);

  // Authenticate against the local registry. Token goes into a workspace-root
  // .npmrc so pnpm picks it up for the publish; we restore the original (or
  // delete the file) in `finally`.
  const token = await createTestUser();
  const npmrcPath = path.join(WORKSPACE_ROOT, ".npmrc");
  const originalNpmrc = fs.existsSync(npmrcPath)
    ? fs.readFileSync(npmrcPath, "utf-8")
    : null;
  fs.writeFileSync(
    npmrcPath,
    `//localhost:8080/:_authToken=${token}\nregistry=${REGISTRY_URL}/\n` +
      (originalNpmrc ? `\n${originalNpmrc}` : ""),
    "utf-8",
  );

  try {
    const filterArgs = PUBLISH_FILTERS.flatMap((p) => ["--filter", p]);
    // The registry is started with --local-packages '@powerhousedao/*,
    // document-model,ph-cmd', so verdaccio never consults the npmjs uplink
    // for these and accepts the publish even when the same workspace version
    // (e.g. 6.0.0-dev.247) already exists on npmjs. --force is a belt-and-
    // braces against pnpm's local existence checks.
    const args = [
      "-r",
      ...filterArgs,
      "publish",
      "--registry",
      REGISTRY_URL,
      "--tag",
      "dev",
      "--no-git-checks",
      "--access",
      "public",
      "--force",
      "--report-summary",
    ];
    console.log(`$ pnpm ${args.join(" ")}`);
    const res = spawnSync("pnpm", args, {
      cwd: WORKSPACE_ROOT,
      stdio: "inherit",
    });
    if (res.status !== 0) {
      throw new Error(
        `pnpm publish exited with status ${res.status ?? "signal"}`,
      );
    }

    // Verify a couple of headline packages have the dev tag pointing at the
    // current workspace version (no bumping necessary).
    for (const name of ["ph-cmd", "@powerhousedao/connect", "document-model"]) {
      const out = execSync(
        `npm view ${name} dist-tags.dev --registry ${REGISTRY_URL}`,
      )
        .toString()
        .trim();
      if (!out) {
        throw new Error(`Expected ${name} to be published with the dev tag`);
      }
      console.log(`  ${name}@dev → ${out}`);
    }
    console.log("\n✅ workspace packages published locally\n");
  } finally {
    if (originalNpmrc === null) {
      try {
        fs.unlinkSync(npmrcPath);
      } catch {
        /* no-op */
      }
    } else {
      fs.writeFileSync(npmrcPath, originalNpmrc, "utf-8");
    }
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
