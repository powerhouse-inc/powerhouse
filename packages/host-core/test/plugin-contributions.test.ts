import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resolvePluginContributions } from "../src/plugins-resolve.js";

// `ph run <host> --explain drives` resolves what the composition's plugins
// CONTRIBUTE (workflow-plugins plan) without knowing the host type and
// without failing on specifiers the project tree cannot resolve (Connect's
// browser built-ins) — those are listed instead.

const temporary: string[] = [];
afterEach(() => {
  for (const dir of temporary.splice(0)) {
    rmSync(dir, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 100,
    });
  }
});

function makeProject(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "ph-contrib-"));
  temporary.push(dir);
  writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify({ name: "contrib-lab", type: "module" }),
  );
  return dir;
}

function writePlugin(projectRoot: string, name: string, source: string): void {
  const pkgDir = path.join(projectRoot, "node_modules", name);
  mkdirSync(pkgDir, { recursive: true });
  writeFileSync(
    path.join(pkgDir, "package.json"),
    JSON.stringify({
      name,
      type: "module",
      exports: { ".": { import: "./index.js", default: "./index.js" } },
    }),
  );
  writeFileSync(path.join(pkgDir, "index.js"), source);
}

describe("resolvePluginContributions", () => {
  it("collects drive contributions from factories (with entry config) and objects, labelled by plugin", async () => {
    const dir = makeProject();
    writePlugin(
      dir,
      "flows-plugin",
      `export default (config) => ({
        name: "flows",
        appliesTo: "switchboard",
        contributions: { drives: [{ slug: config.slug ?? "workflows", name: "Workflows", preferredEditor: "workflow-studio" }] },
      });`,
    );
    writePlugin(
      dir,
      "audit-plugin",
      `export default { name: "audit", contributions: { drives: [{ slug: "audit-log" }] } };`,
    );
    const plan = await resolvePluginContributions(
      dir,
      "run",
      [
        { module: "flows-plugin", config: { slug: "automations" } },
        "audit-plugin",
      ],
      "host.js",
    );
    expect(plan.unresolved).toEqual([]);
    expect(plan.drives).toEqual([
      {
        declaration: {
          slug: "automations",
          name: "Workflows",
          preferredEditor: "workflow-studio",
        },
        source: "flows",
      },
      { declaration: { slug: "audit-log" }, source: "audit" },
    ]);
  });

  it("lists unresolvable specifiers instead of throwing; skips inactive verbs", async () => {
    const dir = makeProject();
    writePlugin(
      dir,
      "dev-only",
      `export default { name: "dev-only", contributions: { drives: [{ slug: "x" }] } };`,
    );
    const plan = await resolvePluginContributions(
      dir,
      "run",
      [
        "@powerhousedao/connect/plugins/workflows",
        { module: "dev-only", verbs: ["dev"] },
      ],
      "host.js",
    );
    expect(plan.unresolved).toEqual([
      "@powerhousedao/connect/plugins/workflows",
    ]);
    expect(plan.drives).toEqual([]);
  });

  it("still validates entry config against the plugin's schema", async () => {
    const dir = makeProject();
    // the fake plugin needs zod: link the repo's copy into the temp project
    const zodDir = path.dirname(
      createRequire(import.meta.url).resolve("zod/package.json"),
    );
    mkdirSync(path.join(dir, "node_modules"), { recursive: true });
    symlinkSync(zodDir, path.join(dir, "node_modules", "zod"), "junction");
    writePlugin(
      dir,
      "strict-plugin",
      `import { z } from "zod";
       export default (config) => ({
         name: "strict",
         configSchema: z.strictObject({ ok: z.boolean() }),
         contributions: { drives: [] },
       });`,
    );
    await expect(
      resolvePluginContributions(
        dir,
        "run",
        [{ module: "strict-plugin", config: { nope: true } }],
        "host.js",
      ),
    ).rejects.toThrow(/config for plugin "strict" is invalid/);
  });
});
