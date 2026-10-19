import { packageJsonExports } from "@powerhousedao/shared/clis/constants";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { ts } from "ts-morph";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  agentGuideTemplates,
  packageJsonTemplate,
  readmeTemplate,
  vitestConfigTemplate,
} from "templates";
import { detectFeatures } from "../../codegen/features.js";
import {
  writeAiConfigFiles,
  writeGeneratedProjectRootFiles,
  writeModuleFiles,
} from "./generated-project-files.js";

const temporary: string[] = [];

afterEach(() => {
  for (const dir of temporary.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function makeTempProject(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  temporary.push(dir);
  return dir;
}

describe("writeGeneratedProjectRootFiles", () => {
  it("requires override in a project written by ph init", async () => {
    const dir = makeTempProject("ph-init-override-");
    await writeGeneratedProjectRootFiles(dir);
    const config: unknown = ts.parseConfigFileTextToJson(
      "tsconfig.json",
      readFileSync(join(dir, "tsconfig.json"), "utf8"),
    ).config;
    expect(config).toMatchObject({
      compilerOptions: { noImplicitOverride: true },
    });
    writeFileSync(
      join(dir, "fixture.ts"),
      "class Parent { method() {} }\nclass Child extends Parent { method() {} }\n",
    );
    writeFileSync(
      join(dir, "consumer.json"),
      JSON.stringify({
        extends: "./tsconfig.json",
        compilerOptions: {
          types: [],
          noEmit: true,
          emitDeclarationOnly: false,
          incremental: false,
        },
        files: ["fixture.ts"],
        include: [],
      }),
    );
    const compile = () =>
      spawnSync(
        process.execPath,
        [
          join(
            import.meta.dirname,
            "../../../../../node_modules/typescript/bin/tsc",
          ),
          "-p",
          join(dir, "consumer.json"),
          "--pretty",
          "false",
        ],
        { encoding: "utf8" },
      );
    const result = compile();
    expect(result.status, result.stdout + result.stderr).toBe(1);
    expect(result.stdout + result.stderr).toContain(
      "fixture.ts(2,30): error TS4114:",
    );
    writeFileSync(
      join(dir, "fixture.ts"),
      "class Parent { method() {} }\nclass Child extends Parent { override method() {} }\n",
    );
    const fixed = compile();
    expect(fixed.status, fixed.stdout + fixed.stderr).toBe(0);
  });
});

// The export is part of every package's map; the list arrives with the first
// generated piece, which is also when the pieces framework is installed.
describe("a new project's pieces entry", () => {
  it("exports ./pieces without writing a pieces list", async () => {
    const dir = makeTempProject("ph-init-pieces-");

    await writeModuleFiles(dir);

    const exports = (
      JSON.parse(packageJsonTemplate("test-project", {}, {})) as {
        exports: Record<string, unknown>;
      }
    ).exports;
    expect(exports["./pieces"]).toEqual(packageJsonExports["./pieces"]);
    // Node only, like ./pieces: `ph build` builds no browser subgraphs.
    expect(exports["./subgraphs"]).not.toHaveProperty("browser");
    const subgraphsIndex = readFileSync(
      join(dir, "subgraphs", "index.ts"),
      "utf-8",
    );
    expect(subgraphsIndex).toContain("WARNING: DO NOT EDIT");
    expect(subgraphsIndex).toContain("export {};");
    expect(existsSync(join(dir, "pieces"))).toBe(false);
    expect(detectFeatures(dir)).not.toContain("piece");
  });
});

// `ph migrate` runs writeModuleFiles over an existing project
// (src/codegen/migrate.ts → writeAllGeneratedProjectFiles). The module
// aggregate files accumulate exports after scaffolding, so the migrate path
// must seed them without clobbering what codegen or a hand has added — the
// bug this pins: a migrate reset subgraphs/index.ts to the bare banner and
// every subgraph silently unregistered.
describe("writeModuleFiles over an existing project", () => {
  const subgraphExport =
    'export * as StatementsSubgraph from "./statements/index.js";\n';

  it("preserves a populated subgraphs/index.ts", async () => {
    const dir = makeTempProject("ph-migrate-subgraphs-");
    mkdirSync(join(dir, "subgraphs"), { recursive: true });
    writeFileSync(
      join(dir, "subgraphs", "index.ts"),
      `/**\n * WARNING: DO NOT EDIT\n * This file is auto-generated and updated by codegen\n */\n${subgraphExport}`,
    );

    await writeModuleFiles(dir);

    const contents = readFileSync(join(dir, "subgraphs", "index.ts"), "utf-8");
    expect(contents).toContain(subgraphExport.trim());
  });

  it("re-seeds a subgraphs/index.ts that is still only the banner", async () => {
    const dir = makeTempProject("ph-migrate-banner-");
    mkdirSync(join(dir, "subgraphs"), { recursive: true });
    writeFileSync(
      join(dir, "subgraphs", "index.ts"),
      "/* an older banner */\n",
    );

    await writeModuleFiles(dir);

    const contents = readFileSync(join(dir, "subgraphs", "index.ts"), "utf-8");
    expect(contents).toContain("WARNING: DO NOT EDIT");
  });

  it("preserves the other module aggregates the same way", async () => {
    const dir = makeTempProject("ph-migrate-aggregates-");
    const populated: [string, string][] = [
      [
        join("document-models", "document-models.ts"),
        "export const documentModels = [myModel] as const;\n",
      ],
      [join("editors", "editors.ts"), "export const editors = [myEditor];\n"],
      [
        join("processors", "connect.ts"),
        "export const processorFactoryBuilders = [myBuilder];\n",
      ],
    ];
    for (const [rel, contents] of populated) {
      mkdirSync(join(dir, rel, ".."), { recursive: true });
      writeFileSync(join(dir, rel), contents);
    }

    await writeModuleFiles(dir);

    for (const [rel, contents] of populated) {
      expect(readFileSync(join(dir, rel), "utf-8")).toBe(contents);
    }
    // The static, fully codegen-owned processors files are refreshed to the
    // current template even when present: they accumulate nothing.
    expect(
      readFileSync(join(dir, "processors", "index.ts"), "utf-8"),
    ).toContain("export { processorFactory }");
  });
});

// `ph init` scaffolds the AI configs into a directory it just created, while
// `ph migrate` runs the same writer over a live project (src/codegen/
// migrate.ts → writeAllGeneratedProjectFiles). An AI config is user-owned the
// moment it exists — the bug this pins: a migrate reset CLAUDE.md, AGENTS.md,
// the MCP configs and the editor settings to the pristine templates,
// discarding user instructions, hand-added MCP servers, accumulated Claude
// Code permission grants, and the project's name-derived switchboard port.
describe("writeAiConfigFiles", () => {
  const aiConfigFiles = [
    "CLAUDE.md",
    "AGENTS.md",
    ".mcp.json",
    join(".cursor", "mcp.json"),
    join(".gemini", "settings.json"),
    join(".claude", "settings.local.json"),
    ...Object.keys(agentGuideTemplates),
  ];

  it("writes the full set into a fresh scaffold", async () => {
    const dir = makeTempProject("ph-init-ai-configs-");

    await writeAiConfigFiles(dir);

    for (const rel of aiConfigFiles) {
      expect(readFileSync(join(dir, rel), "utf-8")).not.toBe("");
    }
    // Spot-check content, not just existence: the scaffold's .mcp.json
    // registers the reactor MCP server.
    const mcp = JSON.parse(readFileSync(join(dir, ".mcp.json"), "utf-8")) as {
      mcpServers: Record<string, unknown>;
    };
    expect(mcp.mcpServers["reactor-mcp"]).toBeDefined();
  });

  it("leaves every existing config byte-identical", async () => {
    const dir = makeTempProject("ph-migrate-ai-configs-");
    const customized: [string, string][] = aiConfigFiles.map((rel) => [
      rel,
      `user-customized content of ${rel}\n`,
    ]);
    for (const [rel, contents] of customized) {
      mkdirSync(join(dir, rel, ".."), { recursive: true });
      writeFileSync(join(dir, rel), contents);
    }

    await writeAiConfigFiles(dir);

    for (const [rel, contents] of customized) {
      expect(readFileSync(join(dir, rel), "utf-8")).toBe(contents);
    }
  });

  it("supplies a missing config without touching the rest", async () => {
    const dir = makeTempProject("ph-migrate-ai-missing-");
    const claude = "# My project instructions\n\nNever touch prod.\n";
    writeFileSync(join(dir, "CLAUDE.md"), claude);

    await writeAiConfigFiles(dir);

    expect(readFileSync(join(dir, "CLAUDE.md"), "utf-8")).toBe(claude);
    // The absent files arrive from the templates.
    expect(readFileSync(join(dir, "AGENTS.md"), "utf-8")).toContain("ph vetra");
    expect(existsSync(join(dir, ".claude", "settings.local.json"))).toBe(true);
  });

  it("adds no agent guides next to an AGENTS.md that does not link them", async () => {
    const dir = makeTempProject("ph-migrate-ai-old-agents-");
    writeFileSync(join(dir, "AGENTS.md"), "# Older instructions\n");

    await writeAiConfigFiles(dir);

    expect(existsSync(join(dir, "docs", "agent-guides"))).toBe(false);
  });

  it("restores a missing guide that AGENTS.md links", async () => {
    const dir = makeTempProject("ph-migrate-ai-missing-guide-");
    await writeAiConfigFiles(dir);
    const guide = join(dir, "docs", "agent-guides", "editor-recipes.md");
    rmSync(guide);

    await writeAiConfigFiles(dir);

    expect(readFileSync(guide, "utf-8")).toContain("# Editor recipes");
  });
});

// The agent docs describe the scaffold, and they drifted from it once: they
// named reducer paths that a code-first model does not have (T-210). These
// tests tie the files, globs and scripts the docs name to the templates that
// create them.
describe("agent instructions", () => {
  async function scaffoldAgentDocs() {
    const dir = makeTempProject("ph-agent-docs-");
    await writeAiConfigFiles(dir);
    const agents = readFileSync(join(dir, "AGENTS.md"), "utf-8");
    const guides = Object.keys(agentGuideTemplates).map((rel) =>
      readFileSync(join(dir, rel), "utf-8"),
    );
    return { dir, agents, guides };
  }

  it("links AGENTS.md only to files the scaffold writes and to its own headings", async () => {
    const { dir, agents } = await scaffoldAgentDocs();
    const anchors = [...agents.matchAll(/^#+ (.+)$/gm)].map(
      ([, heading]) =>
        "#" +
        heading
          .toLowerCase()
          .replace(/[^a-z0-9 -]/g, "")
          .replace(/ /g, "-"),
    );
    const links = [...agents.matchAll(/\]\(([^)\s]+)\)/g)].map(
      ([, href]) => href,
    );

    expect(links).toContain("docs/agent-guides/editor-recipes.md");
    for (const href of links) {
      if (href.startsWith("#")) expect(anchors).toContain(href);
      else if (!/^https?:/.test(href)) {
        expect(existsSync(join(dir, href)), href).toBe(true);
      }
    }
  });

  it("links every guide from AGENTS.md", async () => {
    const { agents } = await scaffoldAgentDocs();

    for (const rel of Object.keys(agentGuideTemplates)) {
      expect(agents).toContain(`](${rel})`);
    }
  });

  it("names the coverage globs that vitest measures", async () => {
    const { agents } = await scaffoldAgentDocs();
    const include = /include: \[([^\]]*)\]/.exec(vitestConfigTemplate)?.[1];
    const globs = [...(include ?? "").matchAll(/"([^"]+)"/g)].map(
      ([, glob]) => glob,
    );

    expect(globs).toContain("document-models/**/v*/modules/**");
    for (const glob of globs) expect(agents).toContain(glob);
  });

  it("runs only npm scripts that the package defines", async () => {
    const { agents, guides } = await scaffoldAgentDocs();
    const { scripts } = JSON.parse(
      packageJsonTemplate("test-project", {}, {}),
    ) as { scripts: Record<string, string> };
    const named = [agents, ...guides, readmeTemplate].flatMap((doc) =>
      [...doc.matchAll(/npm run ([\w:-]+)/g)].map(([, script]) => script),
    );

    expect(named).toContain("test:coverage");
    for (const script of new Set(named)) {
      expect(Object.keys(scripts)).toContain(script);
    }
  });
});
