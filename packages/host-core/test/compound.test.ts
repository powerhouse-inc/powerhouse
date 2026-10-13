import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runCompound } from "../src/compound.js";
import { loadHost } from "../src/host-loader.js";
import { readRunRecord } from "../src/run-record.js";
import type { RunnerContext } from "../src/runner-resolver.js";

const temporary: string[] = [];
afterEach(() => {
  for (const dir of temporary.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

/** A hosts project with a compound whose two members use FAKE runners that
 * record their calls to a shared JSON sink and return scripted handles. */
function makeProject(opts?: { startOrder?: string[]; publicBase?: string }): {
  dir: string;
  sink: string;
} {
  const dir = mkdtempSync(path.join(tmpdir(), "ph-compound-"));
  temporary.push(dir);
  writeFileSync(path.join(dir, "powerhouse.config.json"), "{}");
  writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify({ name: "lab", type: "module" }),
  );
  const sink = path.join(dir, "calls.json");

  // fake runner package shared by both members, keyed on the host name it
  // receives so one module can play both roles
  const pkgDir = path.join(dir, "node_modules", "fake-runner");
  mkdirSync(pkgDir, { recursive: true });
  writeFileSync(
    path.join(pkgDir, "package.json"),
    JSON.stringify({
      name: "fake-runner",
      type: "module",
      exports: { ".": { import: "./index.js", default: "./index.js" } },
    }),
  );
  writeFileSync(
    path.join(pkgDir, "index.js"),
    `
import { appendFileSync } from "node:fs";
const sink = ${JSON.stringify(sink)};
const log = (entry) => appendFileSync(sink, JSON.stringify(entry) + "\\n");
export const kind = "reactor";
export const hostSchema = { safeParse: () => ({ success: true }) };
export async function dev(host, ctx) {
  log({ name: host.name, drives: host.config?.drives ?? null, port: host.runner.port });
  // the switchboard-role member reports a created drive URL
  if (host.name.includes("switchboard")) {
    return { port: host.runner.port, driveUrls: ["http://localhost:7064/d/vetra-x"] };
  }
  return { port: host.runner.port };
}
export const run = dev;
`,
  );

  const write = (name: string, source: string) => {
    const d = path.join(dir, "hosts", name);
    mkdirSync(d, { recursive: true });
    writeFileSync(path.join(d, "host.js"), source);
  };
  write(
    "connect",
    `export default { name: "lab-connect", runner: { module: "fake-runner", port: 2064 } };`,
  );
  write(
    "switchboard",
    `export default { name: "lab-switchboard", runner: { module: "fake-runner", port: 7064 } };`,
  );
  const wiring = {
    projectDrivesIntoConnect: true,
    runtimeRecord: true,
    ...(opts?.startOrder ? { startOrder: opts.startOrder } : {}),
    ...(opts?.publicBase ? { drivesPublicBase: opts.publicBase } : {}),
  };
  write(
    "app",
    `export default {
      name: "app",
      runner: { module: "fake-runner", defaultVerb: "dev" },
      children: {
        "app-switchboard": { host: "switchboard" },
        "app-connect": { host: "connect" },
      },
      config: ${JSON.stringify(wiring)},
    };`,
  );
  return { dir, sink };
}

const ctx = (dir: string): RunnerContext => ({
  projectRoot: dir,
  verb: "dev",
  env: {},
});

async function appHost(dir: string) {
  return (await loadHost(dir, "app")).host;
}

interface FakeCall {
  name: string;
  drives: unknown;
  port: number;
}

function calls(sink: string): FakeCall[] {
  if (!existsSync(sink)) return [];
  return readFileSync(sink, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as FakeCall);
}

describe("runCompound", () => {
  it("starts members, projects reactor drives into connect, writes the record", async () => {
    const { dir, sink } = makeProject({
      startOrder: ["app-switchboard", "app-connect"],
    });
    const result = await runCompound(await appHost(dir), ctx(dir), {
      projectName: "lab",
      installSignalHandlers: false,
    });

    const log = calls(sink);
    const sb = log.find((c) => c.name === "lab-switchboard");
    const connect = log.find((c) => c.name === "lab-connect");
    expect(sb?.port).toBe(7064);
    // the connect member received the switchboard's created drive, preserve-all
    expect(connect?.drives).toEqual({
      defaultDrives: [
        { url: "http://localhost:7064/d/vetra-x", name: null, icon: null },
      ],
      preserveStrategy: "preserve-all",
    });

    const record = readRunRecord(dir, "app");
    expect(record?.members).toEqual({
      "app-switchboard": { port: 7064, url: undefined },
      "app-connect": { port: 2064, url: undefined },
    });

    await result.shutdown();
    expect(readRunRecord(dir, "app")).toBeUndefined();
  });

  it("honors startOrder (switchboard before connect so the drive exists)", async () => {
    const { dir, sink } = makeProject({
      startOrder: ["app-switchboard", "app-connect"],
    });
    await runCompound(await appHost(dir), ctx(dir), {
      projectName: "lab",
      installSignalHandlers: false,
    });
    const order = calls(sink).map((c) => c.name);
    expect(order).toEqual(["lab-switchboard", "lab-connect"]);
  });

  it("rebases projected drives onto the public base", async () => {
    const { dir, sink } = makeProject({
      startOrder: ["app-switchboard", "app-connect"],
      publicBase: "https://lab.example",
    });
    await runCompound(await appHost(dir), ctx(dir), {
      projectName: "lab",
      installSignalHandlers: false,
    });
    const connect = calls(sink).find((c) => c.name === "lab-connect");
    const drives = connect?.drives as
      | { defaultDrives: { url: string }[] }
      | undefined;
    expect(drives?.defaultDrives[0]?.url).toBe("https://lab.example/d/vetra-x");
  });

  it("refuses to start when a live record of this project exists (lock)", async () => {
    const { dir } = makeProject();
    const { writeRunRecord } = await import("../src/run-record.js");
    writeRunRecord(dir, {
      pid: process.pid,
      hostName: "app",
      projectName: "lab",
      startedAt: "x",
      members: {},
    });
    await expect(
      runCompound(await appHost(dir), ctx(dir), {
        projectName: "lab",
        installSignalHandlers: false,
      }),
    ).rejects.toThrow(/already running/);
  });

  it("refuses a foreign-project record", async () => {
    const { dir } = makeProject();
    const { writeRunRecord } = await import("../src/run-record.js");
    writeRunRecord(dir, {
      pid: process.pid,
      hostName: "app",
      projectName: "someone-else",
      startedAt: "x",
      members: {},
    });
    await expect(
      runCompound(await appHost(dir), ctx(dir), {
        projectName: "lab",
        installSignalHandlers: false,
      }),
    ).rejects.toThrow(/Refusing to start/);
  });
});
