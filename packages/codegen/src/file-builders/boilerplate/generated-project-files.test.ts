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
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { packageJsonTemplate } from "templates";
import { detectFeatures } from "../../codegen/features.js";
import {
  writeAiConfigFiles,
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
    // Content, not existence: a fresh project's subgraphs aggregate is the
    // banner and nothing else — no export, so no subgraph registers until
    // codegen appends one (makeSubgraphsIndexFile).
    const subgraphsIndex = readFileSync(
      join(dir, "subgraphs", "index.ts"),
      "utf-8",
    );
    expect(subgraphsIndex).toContain("WARNING: DO NOT EDIT");
    expect(subgraphsIndex).not.toContain("export");
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
});
