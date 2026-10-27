import { execSync } from "child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, describe, expect, it } from "vitest";
import {
  installFeatureDependencies,
  lockedRootVersions,
} from "./install-added-dependencies.js";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true });
});

const PIN = "6.2.3-dev.77";

function project(packageJson: Record<string, unknown>): string {
  const dir = mkdtempSync(join(tmpdir(), "ph-install-added-"));
  dirs.push(dir);
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify({ name: "install-added-test", ...packageJson }, null, 2),
  );
  return dir;
}

const read = (dir: string) =>
  JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as Record<
    string,
    Record<string, string>
  >;

describe("installFeatureDependencies", () => {
  it("keeps every module's dependencies when Vetra confirms several at once", async () => {
    const dir = project({
      peerDependencies: { "document-model": PIN },
      devDependencies: { "document-model": PIN },
    });
    const logs: string[] = [];
    const options = { skipInstall: true, log: (m: string) => logs.push(m) };

    await Promise.all([
      installFeatureDependencies(["relationalDbProcessor"], dir, options),
      installFeatureDependencies(["subgraph"], dir, options),
      installFeatureDependencies(["analyticsProcessor"], dir, options),
    ]);

    const { peerDependencies, devDependencies } = read(dir);
    expect(peerDependencies).toMatchObject({
      kysely: "^0.28",
      "@powerhousedao/reactor-api": PIN,
      "@powerhousedao/analytics-engine-core": PIN,
    });
    expect(devDependencies).toMatchObject({
      kysely: "0.28.16",
      "@powerhousedao/reactor-api": PIN,
      "@powerhousedao/analytics-engine-core": PIN,
    });
    expect(logs).toContain(
      "Added to package.json: kysely (peer ^0.28, dev 0.28.16)",
    );
  });

  it("says what it installs, and changes the lockfile only by what it added", async () => {
    // pnpm would install the peer document-model, which this test does not need.
    const dir = project({
      peerDependencies: { "document-model": PIN },
      devDependencies: { zod: "4.6.5" },
    });
    writeFileSync(
      join(dir, "pnpm-workspace.yaml"),
      "autoInstallPeers: false\nminimumReleaseAge: 0\n",
    );
    const env = { ...process.env, npm_config_prefer_offline: "true" };
    execSync("pnpm install --reporter=silent", { cwd: dir, env });
    const before = lockedRootVersions(dir);
    expect(before).toEqual(new Map([["zod", "4.6.5"]]));

    const logs: string[] = [];
    const warnings: string[] = [];
    process.env.npm_config_prefer_offline = "true";
    try {
      await installFeatureDependencies(["relationalDbProcessor"], dir, {
        log: (m) => logs.push(m),
        warn: (m) => warnings.push(m),
        waiting: 'processor "orders"',
      });
    } finally {
      delete process.env.npm_config_prefer_offline;
    }

    expect(warnings).toEqual([]);
    expect(logs[0]).toBe(
      "Added to package.json: kysely (peer ^0.28, dev 0.28.16)",
    );
    expect(logs[1]).toMatch(
      /^Installing kysely with `pnpm i`; processor "orders" is written once it finishes\.\.\.$/,
    );
    expect(logs[2]).toMatch(/^Installed kysely in \d+s\.$/);
    expect(lockedRootVersions(dir)).toEqual(
      new Map([
        ["kysely", "0.28.16"],
        ["zod", "4.6.5"],
      ]),
    );
  }, 120_000);
});
