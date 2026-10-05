import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { buildPnpmLink } from "./use-local.js";

const root = mkdtempSync(path.join(os.tmpdir(), "use-local-"));
const workspace = (dir: string, name: string) => {
  mkdirSync(path.join(root, dir), { recursive: true });
  writeFileSync(path.join(root, dir, "package.json"), JSON.stringify({ name }));
};
workspace("packages/renown", "@renown/sdk");
workspace("packages/reactor-api", "@powerhousedao/reactor-api");
workspace(
  "packages/analytics-engine/core",
  "@powerhousedao/analytics-engine-core",
);
workspace("clis/ph-cli", "@powerhousedao/ph-cli");

afterAll(() => rmSync(root, { recursive: true, force: true }));

describe("buildPnpmLink", () => {
  it("links a package to the directory that declares its name", () => {
    expect(buildPnpmLink("@renown/sdk", root)).toBe(
      `link:${path.join(root, "packages/renown")}`,
    );
    expect(buildPnpmLink("@powerhousedao/reactor-api", root)).toBe(
      `link:${path.join(root, "packages/reactor-api")}`,
    );
    expect(buildPnpmLink("@powerhousedao/analytics-engine-core", root)).toBe(
      `link:${path.join(root, "packages/analytics-engine/core")}`,
    );
    expect(buildPnpmLink("@powerhousedao/ph-cli", root)).toBe(
      `link:${path.join(root, "clis/ph-cli")}`,
    );
  });

  it("falls back to the name when no workspace declares it", () => {
    expect(buildPnpmLink("@powerhousedao/switchboard-gui", root)).toBe(
      `link:${path.join(root, "packages/switchboard-gui")}`,
    );
  });
});
