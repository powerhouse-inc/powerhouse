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

  // pnpm 11 ignores NPM_CONFIG_USERCONFIG, so auth must land in the workspace
  // .npmrc. Move any existing file to a backup first and route SIGINT/SIGTERM
  // through the same restore path — that way a crash between write and the
  // finally block leaves the original content at .npmrc.bak instead of
  // silently clobbering the dev's settings.
  const token = await createTestUser();
  const npmrcPath = path.join(WORKSPACE_ROOT, ".npmrc");
  const backupPath = `${npmrcPath}.publish-ws.bak`;
  const hadExisting = fs.existsSync(npmrcPath);
  if (hadExisting) fs.renameSync(npmrcPath, backupPath);
  fs.writeFileSync(
    npmrcPath,
    `//localhost:8080/:_authToken=${token}\nregistry=${REGISTRY_URL}/\n`,
    { mode: 0o600 },
  );

  let restored = false;
  const restore = () => {
    if (restored) return;
    restored = true;
    try {
      if (hadExisting) fs.renameSync(backupPath, npmrcPath);
      else fs.unlinkSync(npmrcPath);
    } catch {
      /* best-effort */
    }
  };
  // Installing a SIGINT/SIGTERM listener suppresses Node's default exit, so
  // the handler must explicitly terminate — otherwise an interrupt restores
  // .npmrc and then leaves the script running.
  process.on("SIGINT", () => {
    restore();
    process.exit(130);
  });
  process.on("SIGTERM", () => {
    restore();
    process.exit(143);
  });
  process.on("uncaughtException", (err) => {
    restore();
    console.error(err);
    process.exit(1);
  });

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
    restore();
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
