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
import {
  computeOutputsHash,
  describeHostOutputs,
  lintHostImports,
  lintOutputsFile,
  loadHost,
  readOutputsFileHash,
  scanHostImports,
} from "../src/host-loader.js";

// typed-host-configs T3 lane C: `process.` ban, sibling outputs.js imports,
// and the stale-hash gate on generated outputs.js.

const temporary: string[] = [];
afterEach(() => {
  for (const dir of temporary.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

/* ---------------------------------------------------------- process. ban */

describe("lintHostImports — process. is banned", () => {
  it("rejects process.env, pointing at $env and naming the line", () => {
    expect(() =>
      lintHostImports(
        `export default {\n  config: { model: process.env.MODEL },\n};`,
        "hosts/assistant/host.js",
      ),
    ).toThrow(/hosts\/assistant\/host\.js:2 reads `process\.`[\s\S]*\$env/);
  });

  it.each([
    ["optional chaining", "process?.env?.X"],
    ["bracket access", 'process["env"]'],
    ["spaced member access", "process .argv"],
    ["inside a template literal hole", "`${process.env.HOME}/x`"],
  ])("rejects %s", (_label, expression) => {
    expect(() =>
      lintHostImports(`export default { v: ${expression} };`, "host.js"),
    ).toThrow(/reads `process\.`/);
  });

  it("allows a `process` property of another object", () => {
    expect(
      lintHostImports(
        "export default { args: base.runner.process.args, b: x?.process[0] };",
        "host.js",
      ),
    ).toEqual([]);
  });

  it("allows `process` in a comment, a string literal, or as part of a word", () => {
    expect(
      lintHostImports(
        [
          "// read process.env? no: use $env",
          "/** process.env.X is banned here */",
          "export default {",
          '  note: "set process.env.KEY before ph run",',
          "  subprocess: { processes: 2 },",
          "};",
        ].join("\n"),
        "host.js",
      ),
    ).toEqual([]);
  });
});

describe("process. ban — template literals", () => {
  // The bypass: an apostrophe in template TEXT paired with a later quote on
  // the same line, so quote-pairing blanked the hole in between.
  it.each([
    ["an apostrophe in template text", "`it's ${process.env.X}`, b: 'y'"],
    ["a quote in template text", '`say "${process.env.X}"`, b: "y"'],
    ["a nested template in a hole", "`a ${`b ${process.env.X}`} c`"],
    ["a hole after a string with a brace", '`x ${"it\'s }"} ${process.env.Y}`'],
    ["a hole holding an object literal", "`${{ a: 1 }.a}${process.env.Z}`"],
    ["an escaped backtick before the hole", "`\\`${process.env.X}`, b: 'y'"],
  ])("rejects a hole reading process. after %s", (_label, expression) => {
    const source = `export default { v: ${expression} };`;
    expect(() => lintHostImports(source, "host.js")).toThrow(
      /host\.js:1 reads `process\.`/,
    );
    expect(() =>
      lintOutputsFile(`export const outputs = { v: ${expression} };`, "o.js"),
    ).toThrow(/o\.js:1 reads `process\.`/);
  });

  it("names the line of an access inside a multi-line template", () => {
    expect(() =>
      lintHostImports(
        [
          "export default {",
          "  note: `it's",
          "    ${process.env.NOTE}`,",
          "};",
        ].join("\n"),
        "hosts/a/host.js",
      ),
    ).toThrow(/hosts\/a\/host\.js:3 reads `process\.`/);
  });

  it("allows process. in template text, in a string inside a hole, and after a closed template", () => {
    expect(
      lintHostImports(
        [
          "export default {",
          "  a: `it's process.env.X in the text`,",
          '  b: `${"process.env.X"} and ${`process.argv`}`,',
          "  c: `multi",
          "    line process.exit() ${'it\\'s'} text`, d: 'x',",
          "  e: `${{ k: `}` }.k} process.cwd()`,",
          "};",
        ].join("\n"),
        "host.js",
      ),
    ).toEqual([]);
  });
});

/* ------------------------------------------------- outputs.js imports */

describe("scanHostImports — sibling outputs.js", () => {
  it("allows ../<host>/outputs.js next to ../<host>/host.js", () => {
    expect(
      scanHostImports(
        [
          'import config from "../../powerhouse.config.json" with { type: "json" };',
          'import connect from "../connect/host.js";',
          'import { outputs as switchboard } from "../switchboard/outputs.js";',
          "export default {};",
        ].join("\n"),
        "host.js",
      ),
    ).toEqual({ hosts: ["connect"], outputs: ["switchboard"] });
  });

  it.each([
    ["another sibling file", "../switchboard/other.js"],
    ["a nested outputs.js", "../switchboard/x/outputs.js"],
    ["outputs.js outside hosts", "../../outputs.js"],
    ["a package", "@powerhousedao/host-core"],
  ])("still rejects %s", (_label, specifier) => {
    expect(() =>
      scanHostImports(`import x from "${specifier}";\nexport default {};`, "h"),
    ).toThrow(/may only import/);
  });
});

describe("lintOutputsFile — outputs.js is data", () => {
  it("accepts a generated token tree", () => {
    expect(() =>
      lintOutputsFile(
        `// GENERATED\nexport const outputsHash = "sha256:ab";\nexport const outputs = { origin: { $output: { host: "s", path: ["origin"] } } };\n`,
        "outputs.js",
      ),
    ).not.toThrow();
  });

  it.each([
    ["an import", 'import x from "../x/host.js";\nexport const outputs = x;'],
    ["a re-export", 'export { outputs } from "../x/outputs.js";'],
    ["a dynamic import", 'export const outputs = await import("x");'],
  ])("rejects %s", (_label, source) => {
    expect(() => lintOutputsFile(source, "outputs.js")).toThrow(/plain data/);
  });

  it("rejects process. access", () => {
    expect(() =>
      lintOutputsFile(`export const outputs = { a: process.env.A };`, "o.js"),
    ).toThrow(/\$env/);
  });
});

/* ------------------------------------------------------- staleness gate */

const zodDir = path.dirname(
  createRequire(import.meta.url).resolve("zod/package.json"),
);

/** A temp project with a fake reactor runner exporting an outputsSchema and
 * a fake plugin contributing a drive. */
function makeProject(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "ph-host-outputs-"));
  temporary.push(dir);
  writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify({ name: "outputs-lab", type: "module" }),
  );
  writeFileSync(path.join(dir, "powerhouse.config.json"), "{}");
  mkdirSync(path.join(dir, "node_modules"), { recursive: true });
  symlinkSync(zodDir, path.join(dir, "node_modules", "zod"), "junction");
  writePackage(
    dir,
    "fake-runner",
    `import { z } from "zod";
     export const kind = "reactor";
     export const hostSchema = { safeParse: (v) => ({ success: true, data: v }) };
     export const outputsSchema = z.strictObject({
       origin: z.url(),
       drives: z.record(z.string(), z.strictObject({ id: z.string(), url: z.url() })),
     });
     export async function run() {}`,
  );
  writePackage(
    dir,
    "flows-plugin",
    `export default () => ({ name: "flows", contributions: { drives: [{ slug: "workflows", name: "Workflows" }] } });`,
  );
  return dir;
}

function writePackage(projectRoot: string, name: string, source: string) {
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

function writeHostFile(
  projectRoot: string,
  name: string,
  file: string,
  source: string,
) {
  const dir = path.join(projectRoot, "hosts", name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, file), source);
}

const producerHost = (drives: string) => `export default {
  name: "lab-switchboard",
  runner: {
    module: "fake-runner",
    plugins: [{ module: "flows-plugin", verbs: ["dev"] }],
  },
  reactor: { drives: [${drives}] },
};`;

const CONSUMER = `import { outputs as switchboard } from "../switchboard/outputs.js";
export default {
  name: "lab-connect",
  runner: { module: "fake-runner" },
  config: { drive: switchboard.drives.workflows.url },
};`;

function outputsFile(hash: string): string {
  return `// GENERATED by \`ph generate hosts\`. Do not edit.
export const outputsHash = "${hash}";
export const outputs = {
  drives: {
    workflows: { url: { $output: { host: "switchboard", path: ["drives", "workflows", "url"] } } },
  },
};
`;
}

describe("describeHostOutputs", () => {
  it("describes the runner's outputsSchema and the declared local drives (host + plugin, any verb; remotes excluded)", async () => {
    const dir = makeProject();
    writeHostFile(
      dir,
      "switchboard",
      "host.js",
      producerHost(
        `{ slug: "lab", name: "Lab" }, { slug: "far", remote: { url: "http://x/d/far" } }`,
      ),
    );
    const description = await describeHostOutputs(dir, "switchboard");
    expect(description).toMatchObject({
      host: "switchboard",
      runnerModule: "fake-runner",
      drives: ["lab", "workflows"],
      outputsSchema: {
        type: "object",
        properties: { origin: { type: "string", format: "uri" } },
      },
    });
    expect(description?.outputsSchema).not.toHaveProperty("$schema");
    expect(description?.hash).toBe(
      computeOutputsHash({
        host: "switchboard",
        runnerModule: "fake-runner",
        outputsSchema: description?.outputsSchema ?? {},
        drives: ["workflows", "lab"],
      }),
    );
  });

  it("is undefined for a runner without an outputsSchema", async () => {
    const dir = makeProject();
    writePackage(
      dir,
      "plain-runner",
      `export const kind = "reactor";
       export const hostSchema = { safeParse: (v) => ({ success: true, data: v }) };
       export async function run() {}`,
    );
    writeHostFile(
      dir,
      "plain",
      "host.js",
      `export default { name: "p", runner: { module: "plain-runner" } };`,
    );
    expect(await describeHostOutputs(dir, "plain")).toBeUndefined();
  });
});

describe("loadHost — generated outputs.js", () => {
  it("loads a host importing a fresh sibling outputs.js; tokens are plain data", async () => {
    const dir = makeProject();
    writeHostFile(dir, "switchboard", "host.js", producerHost(""));
    const { hash } = (await describeHostOutputs(dir, "switchboard"))!;
    writeHostFile(dir, "switchboard", "outputs.js", outputsFile(hash));
    writeHostFile(dir, "connect", "host.js", CONSUMER);

    const loaded = await loadHost(dir, "connect");
    expect(loaded.host.config).toEqual({
      drive: {
        $output: {
          host: "switchboard",
          path: ["drives", "workflows", "url"],
        },
      },
    });
  });

  it("fails a stale outputs.js (declared drives changed) with 'run `ph generate hosts`'", async () => {
    const dir = makeProject();
    // The producer now declares `lab`; outputs.js was generated before that
    // (ESM caches host.js per process, so the edit is simulated by hashing
    // the pre-edit inputs rather than rewriting the file).
    writeHostFile(
      dir,
      "switchboard",
      "host.js",
      producerHost(`{ slug: "lab", name: "Lab" }`),
    );
    const current = (await describeHostOutputs(dir, "switchboard"))!;
    expect(current.drives).toEqual(["lab", "workflows"]);
    const before = computeOutputsHash({
      host: "switchboard",
      runnerModule: current.runnerModule,
      outputsSchema: current.outputsSchema,
      drives: ["workflows"],
    });
    writeHostFile(dir, "switchboard", "outputs.js", outputsFile(before));
    writeHostFile(dir, "connect", "host.js", CONSUMER);
    await expect(loadHost(dir, "connect")).rejects.toThrow(
      /hosts\/switchboard\/outputs\.js is stale[\s\S]*run `ph generate hosts`/,
    );
  });

  it("fails a stale outputs.js reached through a sibling host.js import", async () => {
    const dir = makeProject();
    writeHostFile(dir, "switchboard", "host.js", producerHost(""));
    writeHostFile(dir, "switchboard", "outputs.js", outputsFile("sha256:0000"));
    writeHostFile(dir, "connect", "host.js", CONSUMER);
    writeHostFile(
      dir,
      "cli",
      "host.js",
      `import connect from "../connect/host.js";\nexport default { name: "cli", runner: { module: "fake-runner" }, config: connect.config };`,
    );
    await expect(loadHost(dir, "cli")).rejects.toThrow(
      /outputs\.js is stale[\s\S]*expected sha256:[0-9a-f]+, found sha256:0000/,
    );
  });

  it("fails an outputs.js without an outputsHash export", async () => {
    const dir = makeProject();
    writeHostFile(dir, "switchboard", "host.js", producerHost(""));
    writeHostFile(
      dir,
      "switchboard",
      "outputs.js",
      "export const outputs = {};\n",
    );
    writeHostFile(dir, "connect", "host.js", CONSUMER);
    await expect(loadHost(dir, "connect")).rejects.toThrow(
      /stale[\s\S]*carries no outputsHash/,
    );
  });

  it("fails a missing outputs.js, pointing at ph generate hosts", async () => {
    const dir = makeProject();
    writeHostFile(dir, "switchboard", "host.js", producerHost(""));
    writeHostFile(dir, "connect", "host.js", CONSUMER);
    await expect(loadHost(dir, "connect")).rejects.toThrow(
      /hosts\/switchboard\/outputs\.js", which does not exist[\s\S]*ph generate hosts/,
    );
  });

  it("fails an outputs.js copied from another host folder (the host name is hashed)", async () => {
    const dir = makeProject();
    writeHostFile(dir, "switchboard", "host.js", producerHost(""));
    const original = (await describeHostOutputs(dir, "switchboard"))!;
    writeHostFile(dir, "sb2", "host.js", producerHost(""));
    writeHostFile(dir, "sb2", "outputs.js", outputsFile(original.hash));
    writeHostFile(
      dir,
      "connect",
      "host.js",
      CONSUMER.replace("../switchboard/outputs.js", "../sb2/outputs.js"),
    );
    await expect(loadHost(dir, "connect")).rejects.toThrow(
      /hosts\/sb2\/outputs\.js is stale/,
    );
  });

  it("does not check a producer's outputs.js nobody imports", async () => {
    const dir = makeProject();
    writeHostFile(dir, "switchboard", "host.js", producerHost(""));
    writeHostFile(dir, "switchboard", "outputs.js", outputsFile("stale"));
    expect((await loadHost(dir, "switchboard")).host.name).toBe(
      "lab-switchboard",
    );
  });

  it("reads the hash export of a generated file", () => {
    expect(readOutputsFileHash(outputsFile("sha256:abc"))).toBe("sha256:abc");
  });
});
