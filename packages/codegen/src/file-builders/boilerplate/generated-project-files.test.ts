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
import { mergedJsonSettings } from "./merge-project-config.js";

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
    // Node only, like ./pieces: `ph build` builds no browser subgraphs.
    expect(exports["./subgraphs"]).not.toHaveProperty("browser");
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
// `ph migrate` runs the same writer over a live project.
describe("writeAiConfigFiles", () => {
  const read = (dir: string, rel: string) =>
    readFileSync(join(dir, rel), "utf-8");
  const readJson = (dir: string, rel: string) =>
    JSON.parse(read(dir, rel)) as unknown;
  const write = (dir: string, rel: string, contents: unknown) => {
    mkdirSync(join(dir, rel, ".."), { recursive: true });
    writeFileSync(
      join(dir, rel),
      typeof contents === "string"
        ? contents
        : `${JSON.stringify(contents, null, 2)}\n`,
    );
  };

  it("writes the full set into a fresh scaffold", async () => {
    const dir = makeTempProject("ph-init-ai-configs-");

    await writeAiConfigFiles(dir);

    expect(read(dir, "AGENTS.md")).toContain("ph vetra");
    expect(read(dir, "CLAUDE.md")).toMatch(/^@AGENTS\.md\n/);
    const reactorMcp = {
      mcpServers: {
        "reactor-mcp": { type: "http", url: "http://localhost:4001/mcp" },
      },
    };
    expect(readJson(dir, ".mcp.json")).toMatchObject(reactorMcp);
    expect(readJson(dir, ".cursor/mcp.json")).toMatchObject(reactorMcp);
    expect(readJson(dir, ".claude/settings.json")).toMatchObject({
      permissions: {
        allow: ["Bash(npm run tsc:*)", "Bash(npm run lint:*)"],
        deny: ["Edit(/document-models/**/gen/**)", "Edit(/.ph/**)"],
      },
    });
    expect(readJson(dir, ".claude/settings.local.json")).toEqual({
      $schema: "https://json.schemastore.org/claude-code-settings.json",
      enableAllProjectMcpServers: true,
      enabledMcpjsonServers: ["reactor-mcp"],
    });
    expect(readJson(dir, ".cursor/cli.json")).toEqual({
      permissions: {
        deny: ["Write(document-models/**/gen/**)", "Write(.ph/**)"],
      },
    });
    expect(readJson(dir, ".gemini/settings.json")).toEqual({
      context: { fileName: ["AGENTS.md", "GEMINI.md"] },
      ...reactorMcp,
    });
  });

  it("leaves existing MCP configs byte-identical", async () => {
    const dir = makeTempProject("ph-migrate-ai-configs-");
    const kept = [".mcp.json", ".cursor/mcp.json"];
    for (const rel of kept) write(dir, rel, `user content of ${rel}\n`);

    await writeAiConfigFiles(dir);

    for (const rel of kept) {
      expect(read(dir, rel)).toBe(`user content of ${rel}\n`);
    }
  });

  it("moves an old project's rules out of settings.local.json", async () => {
    const dir = makeTempProject("ph-migrate-claude-settings-");
    // The template every project before this change was scaffolded with,
    // plus a grant Claude Code appended.
    write(dir, ".claude/settings.local.json", {
      $schema: "https://json.schemastore.org/claude-code-settings.json",
      permissions: {
        allow: [
          "Bash(npm run tsc:*)",
          "Bash(npm run lint:*)",
          "Bash(git log:*)",
        ],
        deny: [
          "Write(./document-models/**/gen/**)",
          "Write(./.ph/**)",
          "Edit(./document-models/**/gen/**)",
          "Edit(./.ph/**)",
        ],
      },
      enableAllProjectMcpServers: true,
      enabledMcpjsonServers: ["reactor-mcp"],
    });

    await writeAiConfigFiles(dir);

    expect(readJson(dir, ".claude/settings.local.json")).toEqual({
      $schema: "https://json.schemastore.org/claude-code-settings.json",
      permissions: { allow: ["Bash(git log:*)"] },
      enableAllProjectMcpServers: true,
      enabledMcpjsonServers: ["reactor-mcp"],
    });
    expect(readJson(dir, ".claude/settings.json")).toMatchObject({
      permissions: {
        deny: ["Edit(/document-models/**/gen/**)", "Edit(/.ph/**)"],
      },
    });
  });

  it("adds its entries to the project's settings and keeps the rest", async () => {
    const dir = makeTempProject("ph-migrate-agent-settings-");
    write(dir, ".claude/settings.json", {
      permissions: { deny: ["Edit(/secrets/**)"], ask: ["Bash(git push:*)"] },
      model: "opus",
    });
    write(dir, ".cursor/cli.json", { permissions: { allow: ["Shell(ls)"] } });
    write(dir, ".gemini/settings.json", {
      context: { fileName: "CONTEXT.md" },
      mcpServers: {
        "reactor-mcp": { type: "http", url: "http://localhost:4123/mcp" },
      },
      theme: "dark",
    });

    const results = await writeAiConfigFiles(dir);

    expect(results).toContainEqual({
      path: ".gemini/settings.json",
      action: "updated",
    });
    expect(readJson(dir, ".claude/settings.json")).toEqual({
      permissions: {
        deny: [
          "Edit(/secrets/**)",
          "Edit(/document-models/**/gen/**)",
          "Edit(/.ph/**)",
        ],
        ask: ["Bash(git push:*)"],
        allow: ["Bash(npm run tsc:*)", "Bash(npm run lint:*)"],
      },
      model: "opus",
      $schema: "https://json.schemastore.org/claude-code-settings.json",
    });
    expect(readJson(dir, ".cursor/cli.json")).toEqual({
      permissions: {
        allow: ["Shell(ls)"],
        deny: ["Write(document-models/**/gen/**)", "Write(.ph/**)"],
      },
    });
    expect(readJson(dir, ".gemini/settings.json")).toEqual({
      context: { fileName: ["CONTEXT.md", "AGENTS.md", "GEMINI.md"] },
      mcpServers: {
        "reactor-mcp": { type: "http", url: "http://localhost:4123/mcp" },
      },
      theme: "dark",
    });
  });

  it("changes nothing on a second run", async () => {
    const dir = makeTempProject("ph-migrate-ai-twice-");
    write(dir, ".gemini/settings.json", { theme: "dark" });
    await writeAiConfigFiles(dir);
    const files = [
      ".claude/settings.json",
      ".claude/settings.local.json",
      ".cursor/cli.json",
      ".gemini/settings.json",
    ];
    const first = files.map((rel) => read(dir, rel));

    await writeAiConfigFiles(dir);

    expect(files.map((rel) => read(dir, rel))).toEqual(first);
    // Gemini's MCP server is the project's to add back.
    expect(readJson(dir, ".gemini/settings.json")).not.toHaveProperty(
      "mcpServers",
    );
  });

  it("leaves a settings file it can't parse alone", async () => {
    const dir = makeTempProject("ph-migrate-ai-broken-");
    write(dir, ".claude/settings.json", "{ not json\n");

    await writeAiConfigFiles(dir);

    expect(read(dir, ".claude/settings.json")).toBe("{ not json\n");
  });

  it("reads settings at a Windows path", () => {
    const file = "C:\\project\\.claude\\settings.json";
    expect(mergedJsonSettings(file, "{ not json\n", {})).toBeUndefined();
    expect(mergedJsonSettings(file, "{}\n", { a: 1 })).toBe('{\n  "a": 1\n}\n');
  });
});
