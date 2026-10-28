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
import { writeRunRecord } from "@powerhousedao/host-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { explainHost } from "../src/services/run/explain.js";

/**
 * `--explain` with `$map` (typed-host-configs T4): a `$map` in
 * `reactor.drives` is named (and rendered from a running producer) in the
 * drive plan, and `--explain outputs` prints the value each token resolves
 * to while its producer runs — never an `$env` value.
 */

const temporary: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const dir of temporary.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

const ZOD_DIR = path.dirname(
  createRequire(import.meta.url).resolve("zod/package.json"),
);

const drivesMap = {
  $map: {
    over: { $output: { host: "switchboard", path: ["drives"] } },
    to: { slug: { $key: true }, remote: { url: { $item: ["url"] } } },
  },
};

function makeProject(hosts: Record<string, unknown>): string {
  const dir = mkdtempSync(path.join(tmpdir(), "ph-explain-map-"));
  temporary.push(dir);
  writeFileSync(path.join(dir, "powerhouse.config.json"), "{}");
  writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify({ name: "lab", type: "module" }),
  );
  const modules = path.join(dir, "node_modules");
  mkdirSync(path.join(modules, "fake-runners"), { recursive: true });
  symlinkSync(ZOD_DIR, path.join(modules, "zod"), "dir");
  writeFileSync(
    path.join(modules, "fake-runners", "package.json"),
    JSON.stringify({
      name: "fake-runners",
      type: "module",
      exports: {
        "./switchboard": "./switchboard.js",
        "./connect": "./connect.js",
      },
    }),
  );
  const common = `
import { z } from "zod";
export const kind = "reactor";
export const hostSchema = { safeParse: (host) => ({ success: true, data: host }) };
export async function run() {}
`;
  writeFileSync(
    path.join(modules, "fake-runners", "switchboard.js"),
    `${common}
export const outputsSchema = z.strictObject({
  origin: z.url(),
  endpoints: z.strictObject({ graphql: z.url() }),
  drives: z.record(z.string(), z.strictObject({ id: z.string(), url: z.url() })),
});
`,
  );
  writeFileSync(path.join(modules, "fake-runners", "connect.js"), common);
  const all: Record<string, unknown> = {
    switchboard: {
      name: "lab-switchboard",
      runner: { module: "fake-runners/switchboard" },
    },
    ...hosts,
  };
  for (const [name, host] of Object.entries(all)) {
    mkdirSync(path.join(dir, "hosts", name), { recursive: true });
    writeFileSync(
      path.join(dir, "hosts", name, "host.js"),
      `export default ${JSON.stringify(host)};`,
    );
  }
  return dir;
}

// Published unsorted; the plugin-created `workflows` drive is not declared
// anywhere, only served.
const switchboardOutputs = {
  origin: "http://localhost:4801",
  endpoints: { graphql: "http://localhost:4801/graphql" },
  drives: {
    workflows: { id: "workflows-1", url: "http://localhost:4801/d/workflows" },
    sektar: { id: "sektar", url: "http://localhost:4801/d/sektar" },
  },
};

const record = {
  version: 2 as const,
  projectName: "lab",
  kind: "reactor" as const,
  verb: "run",
  pid: process.pid,
  startedAt: new Date().toISOString(),
};

async function explain(dir: string, host: string, topic: string) {
  vi.spyOn(process, "cwd").mockReturnValue(dir);
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  await explainHost({ host, topic });
  const out = log.mock.calls.map((call) => String(call[0])).join("\n");
  vi.restoreAllMocks();
  return out;
}

const connect = {
  name: "lab-connect",
  runner: { module: "fake-runners/connect" },
  reactor: {
    backends: {
      sb: {
        kind: "remote",
        remote: {
          url: {
            $output: {
              host: "switchboard",
              path: ["drives", "sektar", "url"],
            },
          },
        },
      },
    },
    drives: drivesMap,
  },
  config: { apiKey: { $env: "EXPLAIN_MAP_SECRET" } },
};

describe("--explain with $map", () => {
  it("standalone: names the $map; renders values once the producer runs", async () => {
    const dir = makeProject({ connect });

    const drivesBefore = await explain(dir, "connect", "drives");
    expect(drivesBefore).toContain(
      "reactor.drives ← «$map over [$output switchboard › drives] →",
    );
    expect(drivesBefore).toContain("its producer is not running now");
    const outputsBefore = await explain(dir, "connect", "outputs");
    expect(outputsBefore).toContain(
      "reactor.drives.$map.over ← $output switchboard › drives",
    );
    expect(outputsBefore).toContain("reactor.drives ← $map over");
    expect(outputsBefore).not.toContain("    = ");

    writeRunRecord(dir, {
      ...record,
      host: "lab-switchboard",
      outputs: switchboardOutputs,
    });
    vi.stubEnv("EXPLAIN_MAP_SECRET", "s3cret");
    const drivesAfter = await explain(dir, "connect", "drives");
    expect(drivesAfter).toContain(
      "(rendered from the running producer's outputs)",
    );
    expect(drivesAfter).toContain("http://localhost:4801/d/workflows");
    const outputsAfter = await explain(dir, "connect", "outputs");
    expect(outputsAfter).toContain(
      'reactor.backends.sb.remote.url ← $output switchboard › drives.sektar.url  (host "switchboard": running)\n      = "http://localhost:4801/d/sektar"',
    );
    // key-sorted: sektar before workflows, whatever the publish order
    expect(outputsAfter).toContain(
      '      = [{"slug":"sektar","remote":{"url":"http://localhost:4801/d/sektar"}},{"slug":"workflows","remote":{"url":"http://localhost:4801/d/workflows"}}]',
    );
    expect(outputsAfter).toContain("config.apiKey ← $env EXPLAIN_MAP_SECRET");
    expect(outputsAfter).not.toContain("s3cret");
    vi.unstubAllEnvs();
  });

  it("drives: a rendered list that fails the drive schema is reported, not thrown", async () => {
    const dir = makeProject({
      connect: {
        name: "lab-connect",
        runner: { module: "fake-runners/connect" },
        reactor: {
          drives: {
            $map: {
              over: { $output: { host: "switchboard", path: ["drives"] } },
              // a whole element where the slug string belongs
              to: { slug: { $item: [] } },
            },
          },
        },
      },
    });
    writeRunRecord(dir, {
      ...record,
      host: "lab-switchboard",
      outputs: switchboardOutputs,
    });
    const out = await explain(dir, "connect", "drives");
    expect(out).toContain("the rendered drives fail the drive schema");
  });

  it("compound: a member's $map renders from the compound's own live record", async () => {
    const dir = makeProject({
      connect: {
        name: "lab-connect",
        runner: { module: "fake-runners/connect" },
      },
      cli: {
        name: "cli",
        runner: { module: "@powerhousedao/host-core/runners/compound" },
        children: {
          "cli-connect": { host: "connect", reactor: { drives: drivesMap } },
          "cli-switchboard": { host: "switchboard" },
        },
      },
    });
    const before = await explain(dir, "cli", "drives");
    expect(before).toContain("[cli › cli-connect (connect)]");
    expect(before).toContain("its producer is not running now");

    // A standalone switchboard does NOT feed the compound's members.
    writeRunRecord(dir, {
      ...record,
      host: "lab-switchboard",
      outputs: switchboardOutputs,
    });
    expect(await explain(dir, "cli", "drives")).toContain(
      "its producer is not running now",
    );

    writeRunRecord(dir, {
      ...record,
      host: "cli",
      kind: "compound",
      members: {
        "cli-switchboard": {
          host: "switchboard",
          runnerModule: "fake-runners/switchboard",
          kind: "reactor",
          verb: "run",
          outputs: switchboardOutputs,
        },
      },
    });
    const after = await explain(dir, "cli", "drives");
    expect(after).toContain("(rendered from the running producer's outputs)");
    expect(after).toContain("http://localhost:4801/d/workflows");
    const outputs = await explain(dir, "cli", "outputs");
    expect(outputs).toMatch(
      /1\. cli-switchboard \(switchboard\)\n {2}2\. cli-connect \(connect\) {2}after cli-switchboard/,
    );
    expect(outputs).toContain('"slug":"workflows"');
  });
});
