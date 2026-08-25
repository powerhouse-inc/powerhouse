const REGISTRY = "https://registry.npmjs.org";
const POLL_INTERVAL_MS = 15_000;

type Packument = {
  versions?: Record<string, unknown>;
  "dist-tags"?: Record<string, string>;
};

// Non-private package names under the release project globs.
export async function listPublishablePackages(
  globs: string[],
  cwd = process.cwd(),
): Promise<string[]> {
  const names: string[] = [];
  for (const pattern of globs) {
    const glob = new Bun.Glob(`${pattern}/package.json`);
    for await (const path of glob.scan({ cwd })) {
      const pkg = (await Bun.file(`${cwd}/${path}`).json()) as {
        name?: string;
        private?: boolean;
      };
      if (pkg.name && !pkg.private) names.push(pkg.name);
    }
  }
  return names.sort();
}

// Same abbreviated packument pnpm/npm resolve from, so "visible" here means
// installable downstream.
async function isServed(
  name: string,
  version: string,
  tag: string,
): Promise<boolean> {
  const res = await fetch(`${REGISTRY}/${name.replace("/", "%2F")}`, {
    headers: {
      accept: "application/vnd.npm.install-v1+json",
      "cache-control": "no-cache",
    },
  });
  if (!res.ok) return false;
  const doc = (await res.json()) as Packument;
  return (
    doc.versions?.[version] !== undefined && doc["dist-tags"]?.[tag] === version
  );
}

// Publish acks can precede registry visibility by minutes; block until every
// package serves `version` under `tag` or throw after `timeoutMs`.
export async function waitForNpmPropagation(
  names: string[],
  version: string,
  tag: string,
  timeoutMs = 15 * 60_000,
  pollIntervalMs = POLL_INTERVAL_MS,
): Promise<void> {
  const start = Date.now();
  let pending = names;
  for (;;) {
    const results = await Promise.all(
      pending.map(async (name) => ({
        name,
        ok: await isServed(name, version, tag).catch(() => false),
      })),
    );
    pending = results.filter((r) => !r.ok).map((r) => r.name);
    const elapsed = Math.round((Date.now() - start) / 1000);
    if (pending.length === 0) {
      console.log(
        `>>> npm serves ${version} (tag ${tag}) for all ${names.length} packages after ${elapsed}s`,
      );
      return;
    }
    console.log(
      `>>> waiting for npm to serve ${version} (${elapsed}s): ${pending.join(", ")}`,
    );
    if (Date.now() - start >= timeoutMs) {
      throw new Error(
        `npm did not serve ${version} within ${timeoutMs / 1000}s for: ${pending.join(", ")}`,
      );
    }
    await Bun.sleep(pollIntervalMs);
  }
}
