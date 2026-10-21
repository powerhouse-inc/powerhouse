import { execFile } from "node:child_process";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { expect, it } from "vitest";
import { REPO_ROOT, sanitize, type Manifest } from "./lib.js";

const execFileAsync = promisify(execFile);

it("writes the offline subgraphs-only selection, classifications and unresolved count without starting a baseline", async () => {
  const root = await mkdtemp(join(tmpdir(), "registry-load-command-"));
  try {
    const toolsDir = join(root, "tools/registry-audit");
    const cache = join(root, ".cache/registry-audit");
    await mkdir(toolsDir, { recursive: true });
    await mkdir(cache, { recursive: true });
    for (const file of [
      "load.ts",
      "load-worker.ts",
      "lib.ts",
      "subgraph-rule.ts",
    ]) {
      await copyFile(join(import.meta.dirname, file), join(toolsDir, file));
    }
    await symlink(
      join(REPO_ROOT, "node_modules"),
      join(root, "node_modules"),
      "junction",
    );
    await writeFile(join(root, "package.json"), '{"type":"module"}');
    const invocations = join(root, "workers.jsonl");
    const observer = join(root, "observer.mjs");
    await writeFile(
      observer,
      `import { appendFileSync } from "node:fs";
if (process.argv[1]?.endsWith("/load-worker.ts")) appendFileSync(${JSON.stringify(invocations)}, JSON.stringify(process.argv.slice(2)) + "\\n");`,
    );

    const manifest: Manifest = {
      registry: "https://offline.invalid",
      packages: {},
    };
    for (const fixture of [
      {
        name: "@fixture/model-only",
        entry: "./document-models",
        source: 'throw new Error("model-only packages must be skipped");',
      },
      {
        name: "@fixture/subgraph-only",
        entry: "./subgraphs",
        source: `
export class Published { static subgraphName = "published"; static [Symbol.for("powerhouse.subgraph")]() { throw new Error("must not compile"); } }
export class Legacy { name = "legacy"; typeDefs = {}; resolvers = {}; }
`,
      },
      {
        name: "@fixture/unresolved",
        entry: "./subgraphs",
        source:
          'export class NeedsHost { constructor() { throw new Error("missing host"); } }',
      },
    ]) {
      const extractedPath = join(cache, "extracted", sanitize(fixture.name));
      await mkdir(extractedPath, { recursive: true });
      await writeFile(
        join(extractedPath, "package.json"),
        JSON.stringify({
          name: fixture.name,
          type: "module",
          exports: { [fixture.entry]: { import: "./entry.mjs" } },
        }),
      );
      await writeFile(join(extractedPath, "entry.mjs"), fixture.source);
      const installed = join(
        cache,
        "load",
        sanitize(fixture.name),
        "node_modules",
        fixture.name,
      );
      await mkdir(join(installed, ".."), { recursive: true });
      await symlink(extractedPath, installed, "junction");
      manifest.packages[fixture.name] = {
        name: fixture.name,
        version: "1.0.0",
        tarballUrl: "https://offline.invalid/fixture.tgz",
        tarballPath: join(root, "not-downloaded.tgz"),
        extractedPath,
      };
    }
    await writeFile(join(cache, "manifest.json"), JSON.stringify(manifest));
    const { stdout, stderr } = await execFileAsync(
      join(REPO_ROOT, "node_modules/.bin/tsx"),
      [
        join(toolsDir, "load.ts"),
        "--subgraphs-only",
        "--skip-install",
        "--filter",
        "@fixture/",
        "--limit",
        "2",
      ],
      {
        cwd: root,
        env: {
          ...process.env,
          NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --import=${observer}`,
        },
        timeout: 20_000,
      },
    );

    const report: unknown = JSON.parse(
      await readFile(join(cache, "load-report.json"), "utf8"),
    );
    expect(report).toMatchObject({
      registry: "https://offline.invalid",
      subgraphsOnly: true,
      selection: {
        packages: [],
        filters: ["@fixture/"],
        fromReport: false,
        limit: 2,
        manifestPackages: 3,
        selectedPackages: 3,
        eligiblePackages: 2,
        processedPackages: 2,
      },
      skippedPackages: ["@fixture/model-only"],
      baselineModels: [],
      subgraphSummary: {
        newStyle: 1,
        oldStyle: 1,
        namelessOther: 1,
        unresolved: 1,
      },
      results: [
        {
          package: "@fixture/subgraph-only",
          version: "1.0.0",
          status: "audited-subgraphs",
          loadedModels: [],
          subgraphs: [
            {
              exports: ["Legacy"],
              className: "Legacy",
              classification: "old-style",
              evidence:
                "Construction required: instance has name/typeDefs/resolvers",
              constructed: true,
              constructionRequired: true,
            },
            {
              exports: ["Published"],
              className: "Published",
              classification: "new-style",
              evidence:
                "Own static subgraphName and static powerhouse.subgraph protocol",
              constructed: false,
              constructionRequired: false,
            },
          ],
        },
        {
          package: "@fixture/unresolved",
          version: "1.0.0",
          status: "audited-subgraphs",
          loadedModels: [],
          subgraphs: [
            {
              exports: ["NeedsHost"],
              className: "NeedsHost",
              classification: "nameless/other",
              evidence:
                "Construction required but failed with empty host arguments: missing host. Classification unresolved.",
              constructed: false,
              constructionRequired: true,
            },
          ],
        },
      ],
    });
    expect(
      (await readFile(invocations, "utf8"))
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line) as unknown),
    ).toEqual([["@fixture/subgraph-only"], ["@fixture/unresolved"]]);
    expect(stdout).toContain(
      "Done. auditedSubgraphs=2 loaded=0 noModels=0 bootFailed=0 installFailed=0",
    );
    expect(stderr).toBe("");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 30_000);
