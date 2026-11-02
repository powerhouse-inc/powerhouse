import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { validateConnectPluginConfigs } from "../src/runners/connect-plugin-configs.js";

/** `ph run` validates composed Connect plugin entry configs against the
 * project's `@powerhousedao/connect/plugin-configs` before Connect boots. */

const temporary: string[] = [];

afterEach(() => {
  for (const dir of temporary.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

// A stand-in for Connect's zod-only entry: a strict schema for the generic
// plugin, shaped like zod's safeParse result.
const FAKE_ENTRY = `
const generic = {
  safeParse(value) {
    const unknown = Object.keys(value ?? {}).filter((k) => k !== "allowAddDrive");
    if (unknown.length > 0) {
      return { success: false, error: { issues: [{ path: [], message: \`Unrecognized key: "\${unknown[0]}"\` }] } };
    }
    if (value?.allowAddDrive !== undefined && typeof value.allowAddDrive !== "boolean") {
      return { success: false, error: { issues: [{ path: ["allowAddDrive"], message: "Invalid input: expected boolean" }] } };
    }
    return { success: true, data: value };
  },
};
export const connectPluginConfigSchemas = {
  "@powerhousedao/connect/plugins/generic": generic,
};
`;

/** `withEntry: false` is a Connect that predates the plugin-configs export. */
function makeProject(withEntry: boolean): string {
  const dir = mkdtempSync(path.join(tmpdir(), "ph-connect-plugin-configs-"));
  temporary.push(dir);
  writeFileSync(path.join(dir, "package.json"), '{"name":"lab"}');
  const pkg = path.join(dir, "node_modules", "@powerhousedao", "connect");
  mkdirSync(pkg, { recursive: true });
  writeFileSync(
    path.join(pkg, "package.json"),
    JSON.stringify({
      name: "@powerhousedao/connect",
      type: "module",
      exports: withEntry
        ? { "./plugin-configs": { default: "./plugin-configs.js" } }
        : { "./package.json": "./package.json" },
    }),
  );
  writeFileSync(path.join(pkg, "plugin-configs.js"), FAKE_ENTRY);
  return dir;
}

const WHERE = "hosts/connect/host.js";
const GENERIC = "@powerhousedao/connect/plugins/generic";

describe("validateConnectPluginConfigs", () => {
  it("fails naming the plugin and the typo'd key", async () => {
    const project = makeProject(true);
    const run = validateConnectPluginConfigs(
      project,
      [{ module: GENERIC, config: { allowAddDrives: true } }],
      "dev",
      WHERE,
    );
    await expect(run).rejects.toThrow(
      `${WHERE}: config for plugin "${GENERIC}" is invalid`,
    );
    await expect(run).rejects.toThrow('Unrecognized key: "allowAddDrives"');
  });

  it("names the nested key of a wrong value", async () => {
    const project = makeProject(true);
    await expect(
      validateConnectPluginConfigs(
        project,
        [{ module: GENERIC, config: { allowAddDrive: "yes" } }],
        "dev",
        WHERE,
      ),
    ).rejects.toThrow("config.allowAddDrive: Invalid input: expected boolean");
  });

  it("passes valid entries, entries inactive for the verb and unknown specifiers", async () => {
    const project = makeProject(true);
    await expect(
      validateConnectPluginConfigs(
        project,
        [{ module: GENERIC, config: { allowAddDrive: true } }],
        "dev",
        WHERE,
      ),
    ).resolves.toBeUndefined();
    await expect(
      validateConnectPluginConfigs(
        project,
        [
          { module: GENERIC, verbs: ["serve"], config: { typo: 1 } },
          { module: "@acme/connect-plugin", config: { anything: 1 } },
        ],
        "dev",
        WHERE,
      ),
    ).resolves.toBeUndefined();
  });

  it("skips when the project's Connect has no plugin-configs entry", async () => {
    const project = makeProject(false);
    await expect(
      validateConnectPluginConfigs(
        project,
        [{ module: GENERIC, config: { allowAddDrives: true } }],
        "dev",
        WHERE,
      ),
    ).resolves.toBeUndefined();
  });
});
