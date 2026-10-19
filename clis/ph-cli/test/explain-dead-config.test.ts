import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { explainHost } from "../src/services/run/explain.js";

/** `--explain drives` prints the same dead-config warnings the connect
 * runner prints at boot, standalone and for a compound's connect member. */

const temporary: string[] = [];

afterEach(() => {
  vi.restoreAllMocks();
  for (const dir of temporary.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function makeProject(hosts: Record<string, string>): string {
  const dir = mkdtempSync(path.join(tmpdir(), "ph-explain-dead-"));
  temporary.push(dir);
  writeFileSync(path.join(dir, "package.json"), '{"name":"lab"}');
  for (const [name, source] of Object.entries(hosts)) {
    mkdirSync(path.join(dir, "hosts", name), { recursive: true });
    writeFileSync(path.join(dir, "hosts", name, "host.js"), source);
  }
  return dir;
}

const CONNECT_HOST = `
export default {
  name: "connect",
  runner: {
    module: "@powerhousedao/ph-cli/runners/connect",
    plugins: ["@powerhousedao/connect/plugins/workflows"],
  },
  config: { drives: { allowAddDrive: true } },
};
`;

async function explainWarnings(
  projectRoot: string,
  host: string,
): Promise<string[]> {
  vi.spyOn(process, "cwd").mockReturnValue(projectRoot);
  vi.spyOn(console, "log").mockImplementation(() => {});
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  await explainHost({ host, topic: "drives" });
  return warn.mock.calls.map((call) => String(call[0]));
}

describe("--explain drives dead-config warnings", () => {
  it("warns for a standalone connect host", async () => {
    const project = makeProject({ connect: CONNECT_HOST });
    const messages = await explainWarnings(project, "connect");
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain(
      "hosts/connect/host.js: config.drives.allowAddDrive is dead config",
    );
  });

  it("warns for a compound's connect member", async () => {
    const project = makeProject({
      connect: CONNECT_HOST,
      lab: `
export default {
  name: "lab",
  runner: { module: "@powerhousedao/desktop/runner", defaultVerb: "run" },
  children: { studio: { host: "connect" } },
};
`,
    });
    const messages = await explainWarnings(project, "lab");
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain("config.drives.allowAddDrive");
  });

  it("stays quiet when the owning plugin is composed", async () => {
    const project = makeProject({
      connect: CONNECT_HOST.replace(
        '["@powerhousedao/connect/plugins/workflows"]',
        '[{ module: "@powerhousedao/connect/plugins/generic", config: { allowAddDrive: true } }]',
      ),
    });
    expect(await explainWarnings(project, "connect")).toEqual([]);
  });
});
