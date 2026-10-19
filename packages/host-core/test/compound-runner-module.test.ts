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
import * as compound from "../src/runners/compound.js";
import { loadHost } from "../src/host-loader.js";
import type { RunnerContext } from "../src/runner-resolver.js";

const temporary: string[] = [];
afterEach(() => {
  for (const dir of temporary.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

/** Fake member runner exporting run/dev/serve (NO build) — logs verb calls. */
function makeProject(defaultVerb?: string): { dir: string; sink: string } {
  const dir = mkdtempSync(path.join(tmpdir(), "ph-compound-mod-"));
  temporary.push(dir);
  writeFileSync(path.join(dir, "powerhouse.config.json"), "{}");
  writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify({ name: "lab", type: "module" }),
  );
  const sink = path.join(dir, "calls.jsonl");
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
const log = (verb, host) => appendFileSync(sink, JSON.stringify({ verb, name: host.name }) + "\\n");
export const kind = "reactor";
export const hostSchema = { safeParse: (host) => ({ success: true, data: host }) };
export async function run(host) { log("run", host); return {}; }
export async function dev(host) { log("dev", host); return {}; }
export async function serve(host) { log("serve", host); return {}; }
// deliberately NO build export
`,
  );
  const write = (name: string, source: string) => {
    const d = path.join(dir, "hosts", name);
    mkdirSync(d, { recursive: true });
    writeFileSync(path.join(d, "host.js"), source);
  };
  write(
    "web",
    `export default { name: "web", runner: { module: "fake-runner" } };`,
  );
  write(
    "app",
    `export default {
      name: "app",
      runner: {
        module: "@powerhousedao/host-core/runners/compound",
        ${defaultVerb ? `defaultVerb: ${JSON.stringify(defaultVerb)},` : ""}
      },
      children: { "app-web": { host: "web" } },
      config: { runtimeRecord: false },
    };`,
  );
  return { dir, sink };
}

const ctx = (dir: string, verb: string): RunnerContext => ({
  projectRoot: dir,
  verb,
  env: {},
});

async function appHost(dir: string) {
  return (await loadHost(dir, "app")).host;
}

function verbs(sink: string): string[] {
  if (!existsSync(sink)) return [];
  return readFileSync(sink, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((l) => (JSON.parse(l) as { verb: string }).verb);
}

describe("host-core compound runner module (P3.1/P3.2)", () => {
  it("run uses defaultVerb for members", async () => {
    const { dir, sink } = makeProject("dev");
    await compound.run(await appHost(dir), ctx(dir, "run"));
    expect(verbs(sink)).toEqual(["dev"]);
  });

  it("run without defaultVerb starts members at run", async () => {
    const { dir, sink } = makeProject();
    await compound.run(await appHost(dir), ctx(dir, "run"));
    expect(verbs(sink)).toEqual(["run"]);
  });

  it("an explicit verb beats defaultVerb (serve forwarded)", async () => {
    const { dir, sink } = makeProject("dev");
    await compound.serve(await appHost(dir), ctx(dir, "serve"));
    expect(verbs(sink)).toEqual(["serve"]);
  });

  it("a member lacking the forwarded verb fails loud with its verb list", async () => {
    const { dir } = makeProject("dev");
    await expect(
      compound.build(await appHost(dir), ctx(dir, "build")),
    ).rejects.toThrow(/build.*(run, dev, serve|verbs)/is);
  });

  it("at compound run, a member wrapper's defaultVerb picks that member's mode (desktop shape)", async () => {
    const { dir, sink } = makeProject();
    // override the app host: the web member's wrapper sets defaultVerb serve
    const appFile = path.join(dir, "hosts", "app", "host.js");
    writeFileSync(
      appFile,
      `export default {
        name: "app",
        runner: { module: "@powerhousedao/host-core/runners/compound" },
        children: { "app-web": { host: "web", runner: { defaultVerb: "serve" } } },
        config: { runtimeRecord: false },
      };`,
    );
    await compound.run(await appHost(dir), ctx(dir, "run"));
    expect(verbs(sink)).toEqual(["serve"]);
  });
});
