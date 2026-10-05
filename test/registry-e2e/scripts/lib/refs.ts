// Builds a registry image from any git ref: export the tree, build the
// registry with its workspace deps, `pnpm deploy` it, and copy that in.
import { existsSync, mkdirSync, realpathSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { log, run } from "./sh.js";

export const REPO_ROOT = path.resolve(import.meta.dirname, "../../../..");
const DOCKERFILE = path.resolve(
  import.meta.dirname,
  "../../docker/registry.Dockerfile",
);

export interface RefImage {
  ref: string;
  sha: string;
  image: string;
}

export async function resolveSha(ref: string): Promise<string> {
  const res = await run("git", ["rev-parse", "--short=10", `${ref}^{commit}`], {
    cwd: REPO_ROOT,
  });
  return res.stdout.trim();
}

export async function registryImage(ref: string): Promise<RefImage> {
  const sha = await resolveSha(ref);
  const image = `registry-e2e:${sha}`;
  const cached = await run("docker", ["image", "inspect", image], {
    allowFailure: true,
  });
  if (cached.code === 0 && !process.env.REGISTRY_E2E_REBUILD) {
    log(`image ${image} for ${ref} already built`);
    return { ref, sha, image };
  }
  const requested =
    process.env.REGISTRY_E2E_WORK ??
    path.join(os.tmpdir(), "registry-e2e-refs");
  mkdirSync(requested, { recursive: true });
  // pnpm deploy resolves patch paths relatively; a symlinked tmpdir breaks them.
  const work = realpathSync(requested);
  const src = path.join(work, sha);
  const deploy = path.join(work, `${sha}-deploy`);
  if (!existsSync(path.join(src, "package.json"))) {
    log(`exporting ${ref} (${sha}) to ${src}`);
    mkdirSync(src, { recursive: true });
    await run("sh", [
      "-c",
      `git -C "${REPO_ROOT}" archive --format=tar ${sha} | tar -x -C "${src}"`,
    ]);
  }
  log(`building registry at ${sha}`);
  await run(
    "pnpm",
    [
      "install",
      "--frozen-lockfile",
      "--ignore-scripts",
      "--filter",
      "@powerhousedao/registry...",
    ],
    { cwd: src },
  );
  await run(
    "pnpm",
    ["--filter", "@powerhousedao/registry...", "run", "build"],
    {
      cwd: src,
    },
  );
  rmSync(deploy, { recursive: true, force: true });
  await run(
    "pnpm",
    ["--filter", "@powerhousedao/registry", "deploy", "--prod", deploy],
    { cwd: src },
  );
  await run("docker", ["build", "-q", "-t", image, "-f", DOCKERFILE, deploy]);
  log(`built ${image}`);
  return { ref, sha, image };
}
