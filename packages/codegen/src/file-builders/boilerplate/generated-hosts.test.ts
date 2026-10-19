import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { writeGeneratedHostsFiles } from "./generated-project-files.js";

const temporary: string[] = [];

afterEach(() => {
  for (const dir of temporary.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function makeTempProject(): string {
  const dir = mkdtempSync(join(tmpdir(), "ph-hosts-scaffold-"));
  temporary.push(dir);
  return dir;
}

describe("writeGeneratedHostsFiles", () => {
  it("scaffolds hosts/ and the agents/ stub on a fresh project", async () => {
    const dir = makeTempProject();
    await writeGeneratedHostsFiles(dir, "my-project");

    for (const file of [
      "hosts/README.md",
      "hosts/connect/host.js",
      "hosts/switchboard/host.js",
      "hosts/vetra/host.js",
      "hosts/desktop/host.js",
      "hosts/assistant/host.js",
      "hosts/cli/host.js",
      "agents/README.md",
      "agents/profiles.json",
      "agents/agent-profiles/AgentBase.md",
      "agents/skills-tpl/getting-started/00.describe-the-project.md",
      "agents/index.ts",
    ]) {
      expect(existsSync(join(dir, file)), file).toBe(true);
    }

    const connect = readFileSync(join(dir, "hosts/connect/host.js"), "utf-8");
    expect(connect).toContain(`name: "my-project-connect"`);
    expect(connect).toContain("@powerhousedao/ph-cli/runners/connect");
    // ports are REFERENCED from powerhouse.config.json, never copied:
    expect(connect).toContain("config.studio?.port");
    expect(connect).toContain(
      `import config from "../../powerhouse.config.json" with { type: "json" }`,
    );
    // generic plugin enabled, carrying the drive-chrome config pointers:
    expect(connect).toContain("@powerhousedao/connect/plugins/generic");
    expect(connect).toContain("config.connect?.drives?.allowAddDrive");
    expect(connect).toContain("config.connect?.drives?.sections");
    expect(connect).toContain("config.connect?.drives?.icons");
    expect(connect).toContain("config.connect?.home?.background");
    // standalone Connect: its own worker reactor + a local default drive:
    expect(connect).toContain(`backends: {`);
    expect(connect).toContain(`kind: "worker"`);
    expect(connect).toContain(`slug: "powerhouse"`);

    const vetra = readFileSync(join(dir, "hosts/vetra/host.js"), "utf-8");
    expect(vetra).toContain(`defaultVerb: "dev"`);
    expect(vetra).toContain(`host: "connect"`);
    expect(vetra).toContain("config.vetra?.connectPort");
    // R4: generic compound + studio plugins (no vetra-specific runner).
    expect(vetra).toContain("@powerhousedao/host-core/runners/compound");
    expect(vetra).toContain("@powerhousedao/vetra-studio/switchboard");
    expect(vetra).toContain("@powerhousedao/vetra-studio/connect");
    expect(vetra).not.toContain("@powerhousedao/ph-cli/runners/compound");
    // workflow plugins: the connect member derives the Workflows drive from
    // the switchboard member (a drive reference, resolved by the compound)
    expect(vetra).toContain("@powerhousedao/connect/plugins/workflows");
    expect(vetra).toContain(
      `drive: { from: "vetra-switchboard", slug: "workflows" }`,
    );

    // P2.8: single-sourced protocol — the switchboard host references the
    // SAME connect.reactor block the connect host receives via its config.
    const switchboard = readFileSync(
      join(dir, "hosts/switchboard/host.js"),
      "utf-8",
    );
    expect(switchboard).toContain("protocol: config.connect?.reactor ?? {}");
    // the switchboard owns the project drive:
    expect(switchboard).toContain(`slug: "powerhouse"`);
    expect(connect).toContain(`appId: "inc.powerhouse.connect.my-project"`);

    // the desktop host runs on the PUBLISHED generic compound; ${userData}
    // must survive as a literal placeholder (resolved by the runner, not here)
    const desktop = readFileSync(join(dir, "hosts/desktop/host.js"), "utf-8");
    expect(desktop).toContain("@powerhousedao/desktop/runner");
    // the legacy .ph names under the user's root; the read model follows the
    // same root by default — never declared on the reactor's dir
    expect(desktop).toContain('dataDir: "${userData}/.ph/reactor-storage"');
    expect(desktop).not.toMatch(/readModel:\s*\{/);
    expect(desktop).toContain(`defaultVerb: "serve"`);
    expect(desktop).toContain("cspRegistrySync: true");
    expect(desktop).toContain(
      `drive: { from: "desktop-switchboard", slug: "workflows" }`,
    );
    // the switchboard side serves the runtime and its drive:
    expect(switchboard).toContain(
      "@powerhousedao/switchboard/plugins/workflows",
    );

    // P5.8: the agent + cli hosts ride the clint runners; ${userData} stays
    // a literal placeholder; the agents manager references the sibling host.
    const assistant = readFileSync(
      join(dir, "hosts/assistant/host.js"),
      "utf-8",
    );
    expect(assistant).toContain("@powerhousedao/clint/mastra-runner");
    expect(assistant).toContain('remote: { host: "switchboard" }');
    expect(assistant).toContain('workdir: "${userData}/assistant"');
    // cli: the generic compound over switchboard + Connect, Connect as a
    // REMOTE CLIENT (lone remote backend → reactorClient "remote", no PGlite).
    const cli = readFileSync(join(dir, "hosts/cli/host.js"), "utf-8");
    expect(cli).toContain("@powerhousedao/host-core/runners/compound");
    expect(cli).toContain('import switchboard from "../switchboard/host.js"');
    expect(cli).toContain('import connect from "../connect/host.js"');
    expect(cli).toContain('"cli-switchboard": { host: "switchboard" }');
    expect(cli).toContain(
      `drive: { from: "cli-switchboard", slug: "workflows" }`,
    );
    expect(cli).toContain(`kind: "remote"`);
    expect(cli).toContain("/graphql");
    expect(cli).not.toContain("@powerhousedao/clint/clint-runner");
  });

  it("is preserve-on-migrate: never clobbers an existing host file", async () => {
    const dir = makeTempProject();
    await writeGeneratedHostsFiles(dir, "my-project");
    const file = join(dir, "hosts/connect/host.js");
    writeFileSync(file, "// user-owned edit\nexport default {};\n");

    await writeGeneratedHostsFiles(dir, "my-project");
    expect(readFileSync(file, "utf-8")).toContain("user-owned edit");
    // ...while still seeding files the project lacks:
    rmSync(join(dir, "hosts/vetra/host.js"));
    await writeGeneratedHostsFiles(dir, "my-project");
    expect(existsSync(join(dir, "hosts/vetra/host.js"))).toBe(true);
  });
});
