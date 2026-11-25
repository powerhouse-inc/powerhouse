import type { ConnectDevServerContext } from "@powerhousedao/host-core";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Plugin } from "vite";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_CONNECT_DEV_PLUGINS,
  resolveConnectDevPlugins,
} from "../src/services/connect-dev-plugins.js";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

/** A project whose dependencies hold the plugin modules `sources` gives. */
function projectWith(sources: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "ph-dev-plugins-"));
  roots.push(root);
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "p" }));
  for (const [name, source] of Object.entries(sources)) {
    const dir = join(root, "node_modules", name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({ name, type: "module", exports: "./index.js" }),
    );
    writeFileSync(join(dir, "index.js"), source);
  }
  return root;
}

const INSPECTOR = `export default {
  name: "inspector",
  appliesTo: "connect",
  hooks: {
    devServer: (context) => [{ name: "inspector:" + context.projectRoot }],
  },
};`;

const contextOf = (projectRoot: string) =>
  ({ projectRoot }) as ConnectDevServerContext;

const names = (plugins: unknown[]) =>
  plugins.map((plugin) => (plugin as Plugin).name);

const resolve = (
  projectRoot: string,
  options: Partial<Parameters<typeof resolveConnectDevPlugins>[0]> = {},
) =>
  resolveConnectDevPlugins({
    projectRoot,
    where: "hosts/connect/host.js",
    context: contextOf(projectRoot),
    ...options,
  });

describe("a Connect dev server's plugins", () => {
  it("loads DevTools by default, from the CLI's own dependencies", async () => {
    expect(DEFAULT_CONNECT_DEV_PLUGINS).toEqual([
      "@powerhousedao/devtools/connect",
    ]);
    expect(names(await resolve(projectWith({})))).toEqual(["ph-devtools"]);
  });

  it("leaves out a default plugin a host turns off", async () => {
    const plugins = await resolve(projectWith({}), {
      entries: [{ module: "@powerhousedao/devtools/connect", enabled: false }],
    });
    expect(plugins).toEqual([]);
  });

  it("starts without a default plugin that cannot load, and says so", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const plugins = await resolve(projectWith({}), {
      defaults: ["acme-missing-default"],
    });
    expect(plugins).toEqual([]);
    expect(warn).toHaveBeenCalledExactlyOnceWith(
      expect.stringContaining('cannot resolve plugin "acme-missing-default"'),
    );
    warn.mockRestore();
  });

  it("resolves a host's entry for a default plugin from the CLI, not the project", async () => {
    const plugins = await resolve(projectWith({}), {
      entries: [{ module: "@powerhousedao/devtools/connect" }],
    });
    expect(names(plugins)).toEqual(["ph-devtools"]);
  });

  it("adds a host's plugins, resolved from the project, after the default ones", async () => {
    const root = projectWith({ "acme-inspector": INSPECTOR });
    const plugins = await resolve(root, { entries: ["acme-inspector"] });
    expect(names(plugins)).toEqual(["ph-devtools", `inspector:${root}`]);
  });

  it("loads only the host's plugins where there are no default ones", async () => {
    const root = projectWith({ "acme-inspector": INSPECTOR });
    const plugins = await resolve(root, {
      entries: ["acme-inspector"],
      defaults: [],
    });
    expect(names(plugins)).toEqual([`inspector:${root}`]);
  });

  it("names the plugin and the host file when a module cannot be resolved", async () => {
    await expect(
      resolve(projectWith({}), { entries: ["acme-missing"], defaults: [] }),
    ).rejects.toThrow(
      /hosts\/connect\/host\.js: cannot resolve plugin "acme-missing"/,
    );
  });

  it("refuses a plugin without a devServer hook", async () => {
    const root = projectWith({
      "acme-idle": `export default { name: "idle", appliesTo: "connect" };`,
    });
    await expect(
      resolve(root, { entries: ["acme-idle"], defaults: [] }),
    ).rejects.toThrow(/"acme-idle" has no devServer hook/);
  });

  it("starts without a default plugin whose hook fails, and says so", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const root = projectWith({
      "acme-broken": `export default { name: "broken", appliesTo: "connect", hooks: { devServer: () => { throw new Error("no port"); } } };`,
      "acme-inspector": INSPECTOR,
    });
    // A path: the CLI resolves its default plugins from its own dependencies.
    const broken = join(root, "node_modules", "acme-broken", "index.js");
    const plugins = await resolve(root, {
      defaults: [broken],
      entries: ["acme-inspector"],
    });
    expect(names(plugins)).toEqual([`inspector:${root}`]);
    expect(warn).toHaveBeenCalledExactlyOnceWith(
      expect.stringContaining("no port"),
    );
    warn.mockRestore();
  });

  it("refuses a host's plugin whose hook does not return a list", async () => {
    const root = projectWith({
      "acme-single": `export default { name: "single", appliesTo: "connect", hooks: { devServer: () => ({ name: "one" }) } };`,
    });
    await expect(
      resolve(root, { entries: ["acme-single"], defaults: [] }),
    ).rejects.toThrow(/devServer hook of "acme-single" did not return a list/);
  });

  it("refuses a plugin for another kind of host", async () => {
    const root = projectWith({
      "acme-server": `export default { name: "server", appliesTo: "switchboard", hooks: { devServer: () => [] } };`,
    });
    await expect(
      resolve(root, { entries: ["acme-server"], defaults: [] }),
    ).rejects.toThrow(/applies to "switchboard" hosts/);
  });
});
