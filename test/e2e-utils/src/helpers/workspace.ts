import { execSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createTestUser, REGISTRY_URL } from "./registry.js";

// Workspace packages re-published to the local registry from source, so a
// consumer under test exercises local code and not the @dev tag on npmjs.

// Flat, never `@powerhousedao/*`: that glob would also shadow third-party
// packages under the same scope that this workspace does not publish.
export const WORKSPACE_PUBLISH_PACKAGES = [
  "@powerhousedao/config",
  "@powerhousedao/common",
  "@powerhousedao/builder-tools",
  "@powerhousedao/codegen",
  "document-model",
  "@renown/sdk",
  "@powerhousedao/design-system",
  "@powerhousedao/pglite-fs",
  "@powerhousedao/pieces-framework",
  "@powerhousedao/reactor-api",
  "@powerhousedao/reactor-attachments",
  "@powerhousedao/reactor-browser",
  "@powerhousedao/reactor",
  "@powerhousedao/reactor-drive",
  "@powerhousedao/reactor-group",
  "@powerhousedao/reactor-hypercore",
  "@powerhousedao/reactor-mcp",
  "@powerhousedao/reactor-workflow",
  "@powerhousedao/opentelemetry-instrumentation-reactor",
  "@powerhousedao/registry",
  "@powerhousedao/shared",
  "@powerhousedao/vetra",
  "@powerhousedao/workflow",
  "@powerhousedao/powerhouse-vetra-packages",
  "@powerhousedao/analytics-engine-browser",
  "@powerhousedao/analytics-engine-core",
  "@powerhousedao/analytics-engine-graphql",
  "@powerhousedao/analytics-engine-knex",
  "@powerhousedao/analytics-engine-pg",
  "@powerhousedao/connect",
  "@powerhousedao/switchboard",
  "@powerhousedao/ph-cli",
  "ph-cmd",
] as const;

export interface PublishWorkspaceOptions {
  /** The monorepo root: where pnpm and the .npmrc this writes both live. */
  workspaceRoot: string;
  /** Packages whose `dev` dist-tag is checked after the publish. */
  verify?: string[];
}

// Publishes every workspace package to the local registry under the `dev`
// dist-tag. The registry must have been started with these as localPackages.
export async function publishWorkspacePackages(
  options: PublishWorkspaceOptions,
): Promise<void> {
  const { workspaceRoot } = options;
  console.log(`\n=== publish-workspace → ${REGISTRY_URL} ===\n`);
  console.log(
    `Publishing ${WORKSPACE_PUBLISH_PACKAGES.length} workspace packages.\n`,
  );

  // pnpm 11 ignores NPM_CONFIG_USERCONFIG, so auth has to land in the
  // workspace .npmrc; the original is moved aside and put back below.
  const token = await createTestUser();
  const npmrcPath = path.join(workspaceRoot, ".npmrc");
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
  // Installing a listener suppresses Node's default exit, so each handler has
  // to terminate explicitly or the script would run on after restoring.
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
    const filterArgs = WORKSPACE_PUBLISH_PACKAGES.flatMap((p) => [
      "--filter",
      p,
    ]);
    // --force is belt and braces against pnpm's local existence checks; the
    // registry serves these names locally, so npmjs is never consulted.
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
      cwd: workspaceRoot,
      stdio: "inherit",
    });
    if (res.status !== 0) {
      throw new Error(
        `pnpm publish exited with status ${res.status ?? "signal"}`,
      );
    }

    const verify = options.verify ?? [
      "ph-cmd",
      "@powerhousedao/connect",
      "document-model",
    ];
    for (const name of verify) {
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
