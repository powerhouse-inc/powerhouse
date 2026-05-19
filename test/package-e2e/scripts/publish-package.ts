import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import {
  createTestUser,
  REGISTRY_URL,
  writeNpmrc,
} from "@powerhousedao/e2e-utils";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const FIXTURES = path.join(ROOT, "fixtures");
// Use /tmp so pnpm doesn't pick the project up via the monorepo workspace globs.
const PROJECT_PARENT = process.env.PH_PROJECT_PARENT ?? "/tmp/ph-pkg-e2e";
const PROJECT_NAME = process.env.PH_PKG_NAME ?? "test-todo-package";
const PROJECT_DIR = path.join(PROJECT_PARENT, PROJECT_NAME);
const PUBLISHED_FILE = path.join(ROOT, ".published.json");
// Channel for the scaffolded project's @powerhousedao/* deps.
// "dev" tracks the in-flight dev branch; override with PH_TAG=staging|latest.
const TAG = process.env.PH_TAG ?? "dev";

const PH_CLI = path.resolve(ROOT, "node_modules/.bin/ph-cli");

// A throwaway HOME we point ph-cli at, with an ~/.npmrc that forces pnpm to
// resolve packages from our local registry. pnpm 11 doesn't honor the
// NPM_CONFIG_REGISTRY env var for install, and `ph init`'s embedded
// `pnpm install` runs before we can write a project-level .npmrc — so
// overriding HOME is the cleanest way to inject the registry config without
// touching the user's real ~/.npmrc.
const FAKE_HOME = path.join(ROOT, ".fake-home");

function run(cmd: string, cwd: string): void {
  console.log(`$ ${cmd}\n  (cwd=${path.relative(ROOT, cwd) || "."})`);
  execSync(cmd, {
    cwd,
    stdio: "inherit",
    env: { ...process.env, HOME: FAKE_HOME },
  });
}

function prepareFakeHome(authToken: string): void {
  fs.rmSync(FAKE_HOME, { recursive: true, force: true });
  fs.mkdirSync(FAKE_HOME, { recursive: true });
  // pnpm walks `$HOME/.npmrc` for global config. `registry=` is what
  // makes resolution actually hit our local registry; the auth-token line
  // lets npm publish authenticate on the same registry later.
  fs.writeFileSync(
    path.join(FAKE_HOME, ".npmrc"),
    `registry=${REGISTRY_URL}/\n//localhost:8080/:_authToken=${authToken}\n`,
    "utf-8",
  );
}

async function main(): Promise<void> {
  if (!fs.existsSync(PH_CLI)) {
    throw new Error(
      `ph-cli binary not found at ${PH_CLI}. Run 'pnpm install' first.`,
    );
  }

  console.log(`\n=== publish-package: ${PROJECT_NAME} (tag=${TAG}) ===\n`);

  // Resolve and log where ph-cli actually lives so it's obvious this phase
  // is exercising the local workspace's CLI (clis/ph-cli) and not whatever
  // ph-cmd happens to be on PATH globally.
  const require = createRequire(import.meta.url);
  const phPkgJson = require.resolve("@powerhousedao/ph-cli/package.json", {
    paths: [ROOT],
  });
  const phPkg = JSON.parse(fs.readFileSync(phPkgJson, "utf-8")) as {
    name: string;
    version: string;
  };
  const phPkgDir = path.dirname(phPkgJson);
  const realPhPkgDir = fs.realpathSync(phPkgDir);
  const realPhCli = fs.realpathSync(PH_CLI);
  console.log(
    `ph-cli source: ${phPkg.name}@${phPkg.version}\n` +
      `  package:    ${phPkgDir}\n` +
      `  resolved:   ${realPhPkgDir}\n` +
      `  bin shim:   ${PH_CLI}\n` +
      `  bin target: ${realPhCli}\n`,
  );
  const workspaceRoot = path.resolve(ROOT, "../..");
  if (!realPhPkgDir.startsWith(workspaceRoot + path.sep)) {
    throw new Error(
      `Refusing to publish with non-workspace ph-cli (resolved ${realPhPkgDir}). ` +
        `Expected something under ${workspaceRoot}.`,
    );
  }
  console.log(
    `  ✓ ph-cli is the local workspace package (under ${workspaceRoot})\n`,
  );

  fs.rmSync(PROJECT_PARENT, { recursive: true, force: true });
  fs.mkdirSync(PROJECT_PARENT, { recursive: true });

  // Auth + fake HOME must be in place BEFORE ph init so the install it runs
  // internally resolves @powerhousedao/* and document-model from our local
  // registry (which has the workspace-published versions), not from npmjs.
  const token = await createTestUser();
  prepareFakeHome(token);

  // 1. ph init <name> --pnpm [--dev|--staging]
  const tagFlag =
    TAG === "dev" ? "--dev" : TAG === "staging" ? "--staging" : "";
  run(
    `${PH_CLI} init ${PROJECT_NAME} --pnpm ${tagFlag}`.trim(),
    PROJECT_PARENT,
  );

  // 2. Also write an .npmrc into the project itself so subsequent `pnpm`
  // invocations (lint / tsc / build / publish) authenticate and route to
  // the local registry without depending on the fake HOME.
  writeNpmrc(PROJECT_DIR, token);

  // 3. Generate the document model from the zip spec.
  // The fixture zip embeds reducer code in each operation, so codegen writes
  // complete reducer implementations — no manual swap needed for the model.
  const zipDest = path.join(PROJECT_DIR, "todo.json");
  fs.copyFileSync(path.join(FIXTURES, "todo.json"), zipDest);
  run(`${PH_CLI} generate doc --file ./todo.json`, PROJECT_DIR);

  // 4. Generate the editor (boilerplate only) and swap in the fixture UI
  // that actually dispatches addTodo / updateTodo / removeTodo actions —
  // the generated editor only knows about the doc header.
  run(
    `${PH_CLI} generate editor --name todo-editor --document-type test/todo`,
    PROJECT_DIR,
  );
  const editorDest = path.join(PROJECT_DIR, "editors/todo-editor/editor.tsx");
  if (!fs.existsSync(path.dirname(editorDest))) {
    throw new Error(
      `Expected generated editor dir at ${path.dirname(editorDest)}`,
    );
  }
  fs.copyFileSync(path.join(FIXTURES, "editor.tsx"), editorDest);

  // 6. Manifest needs the package name (codegen leaves it empty).
  const manifestPath = path.join(PROJECT_DIR, "powerhouse.manifest.json");
  if (fs.existsSync(manifestPath)) {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8")) as {
      name?: string;
    };
    manifest.name = PROJECT_NAME;
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 4));
  }

  // 7. Quality gates per user spec: lint, typecheck, build.
  run("pnpm lint:fix", PROJECT_DIR);
  run("pnpm tsc --noEmit", PROJECT_DIR);
  run("pnpm build", PROJECT_DIR);

  // 8. Publish to local registry.
  run(`${PH_CLI} publish --registry ${REGISTRY_URL}`, PROJECT_DIR);

  // 9. Record the published name/registry for downstream services.
  fs.writeFileSync(
    PUBLISHED_FILE,
    JSON.stringify(
      { packageName: PROJECT_NAME, registry: REGISTRY_URL },
      null,
      2,
    ),
  );

  console.log(`\n✅ Published ${PROJECT_NAME} to ${REGISTRY_URL}\n`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
