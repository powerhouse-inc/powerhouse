import { run } from "cmd-ts";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { generateConnectRoutesCmd } from "../src/commands/generate-connect-routes.js";

// Under test/fixtures, so the project resolves @powerhousedao/connect.
const fixtures = join(import.meta.dirname, "fixtures");
const fixture = join(fixtures, "connect-routes-package");
const tree = join(fixture, ".ph", "connect-routes.gen.ts");
const originalCwd = process.cwd();

function route(file: string, id: string) {
  const target = join(fixture, "hosts", "connect", "routes", file);
  mkdirSync(join(target, ".."), { recursive: true });
  writeFileSync(
    target,
    `import { createFileRoute } from "@tanstack/react-router";\nexport const Route = createFileRoute("${id}")({});\n`,
  );
}

beforeEach(() => {
  rmSync(fixture, { recursive: true, force: true });
  cpSync(join(fixtures, "classic-package"), fixture, { recursive: true });
  rmSync(join(fixture, ".ph"), { recursive: true, force: true });
  process.chdir(fixture);
});

afterEach(() => {
  process.chdir(originalCwd);
  rmSync(fixture, { recursive: true, force: true });
});

describe("ph-cli generate connect-routes", () => {
  it("writes the tree a project's first route types against", async () => {
    route("_app/stats.tsx", "/_app/stats");

    await run(generateConnectRoutesCmd, []);

    expect(readFileSync(tree, "utf8")).toContain('"/_app/stats"');
  }, 60_000);

  // Studio aliases the route tree to the file, so it stays, without the routes.
  it("keeps only Connect's routes in the tree once the routes are gone", async () => {
    route("_app/stats.tsx", "/_app/stats");
    await run(generateConnectRoutesCmd, []);
    rmSync(join(fixture, "hosts"), { recursive: true });

    await run(generateConnectRoutesCmd, []);

    const text = readFileSync(tree, "utf8");
    expect(text).not.toContain("/_app/stats");
    expect(text).toContain('"/_app"');
  }, 60_000);

  it("writes nothing for a project without routes", async () => {
    await run(generateConnectRoutesCmd, []);

    expect(existsSync(join(fixture, ".ph"))).toBe(false);
  });
});
