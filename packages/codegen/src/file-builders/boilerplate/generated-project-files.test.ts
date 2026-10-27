import { packageJsonExports } from "@powerhousedao/shared/clis/constants";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  cursorReactorMcpServer,
  packageJsonTemplate,
  reactorMcpServer,
} from "templates";
import { detectFeatures } from "../../codegen/features.js";
import {
  migrateReactorMcpEntries,
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
      mcpServers: { "reactor-mcp": { type: "stdio", command: "node" } },
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
      mcpServers: {
        "reactor-mcp": { command: "node", args: ["--run", "mcp"] },
      },
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
      // The old local-URL entry moves to the `ph mcp` launcher.
      mcpServers: {
        "reactor-mcp": { command: "node", args: ["--run", "mcp"] },
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

// Projects scaffolded before `ph mcp` point reactor-mcp at Vetra's HTTP URL.
describe("migrateReactorMcpEntries", () => {
  const httpEntry = { type: "http", url: "http://localhost:41837/mcp" };

  function writeJson(dir: string, rel: string, value: unknown) {
    mkdirSync(join(dir, rel, ".."), { recursive: true });
    writeFileSync(join(dir, rel), JSON.stringify(value, null, 2));
  }

  const readServers = (dir: string, rel: string) =>
    (
      JSON.parse(readFileSync(join(dir, rel), "utf-8")) as {
        mcpServers: Record<string, unknown>;
      }
    ).mcpServers;

  it("rewrites only the reactor-mcp entry of each client config", async () => {
    const dir = makeTempProject("ph-migrate-mcp-");
    const other = { command: "my-server", args: ["--x"] };
    writeJson(dir, ".mcp.json", {
      mcpServers: { "reactor-mcp": httpEntry, other },
      extra: true,
    });
    writeJson(dir, join(".cursor", "mcp.json"), {
      mcpServers: { "reactor-mcp": httpEntry },
    });
    writeJson(dir, join(".gemini", "settings.json"), {
      theme: "dark",
      mcpServers: {
        "reactor-mcp": { httpUrl: "http://127.0.0.1:4001/mcp" },
      },
    });

    expect(await migrateReactorMcpEntries(dir)).toEqual([
      { path: ".mcp.json", action: "updated" },
      { path: ".cursor/mcp.json", action: "updated" },
      { path: ".gemini/settings.json", action: "updated" },
    ]);

    expect(readServers(dir, ".mcp.json")).toEqual({
      "reactor-mcp": { type: "stdio", command: "node", args: ["--run", "mcp"] },
      other,
    });
    expect(
      JSON.parse(readFileSync(join(dir, ".mcp.json"), "utf-8")),
    ).toMatchObject({ extra: true });
    expect(readServers(dir, join(".cursor", "mcp.json"))).toEqual({
      "reactor-mcp": cursorReactorMcpServer,
    });
    expect(readServers(dir, join(".gemini", "settings.json"))).toEqual({
      "reactor-mcp": { command: "node", args: ["--run", "mcp"] },
    });
  });

  it("moves the npx launcher to node --run, and adds the mcp script it runs", async () => {
    const dir = makeTempProject("ph-migrate-mcp-npx-");
    const npx = ["--no", "ph-cli", "mcp"];
    writeJson(dir, "package.json", { name: "x", scripts: { vetra: "v" } });
    writeJson(dir, ".mcp.json", {
      mcpServers: {
        "reactor-mcp": { type: "stdio", command: "npx", args: npx },
      },
    });
    writeJson(dir, join(".gemini", "settings.json"), {
      mcpServers: { "reactor-mcp": { command: "npx", args: npx } },
    });
    // Someone's own launcher stays.
    const own = { type: "stdio", command: "npx", args: ["ph-cli", "mcp"] };
    writeJson(dir, join(".cursor", "mcp.json"), {
      mcpServers: { "reactor-mcp": own },
    });

    expect(await migrateReactorMcpEntries(dir)).toEqual([
      { path: ".mcp.json", action: "updated" },
      { path: ".gemini/settings.json", action: "updated" },
    ]);
    expect(readServers(dir, ".mcp.json")).toEqual({
      "reactor-mcp": { type: "stdio", command: "node", args: ["--run", "mcp"] },
    });
    expect(readServers(dir, join(".cursor", "mcp.json"))).toEqual({
      "reactor-mcp": own,
    });
    expect(
      JSON.parse(readFileSync(join(dir, "package.json"), "utf-8")),
    ).toEqual({ name: "x", scripts: { vetra: "v", mcp: "ph-cli mcp" } });
  });

  it("runs the project's launcher through node, from a subfolder too", () => {
    const dir = makeTempProject("ph-mcp-node-run-");
    writeJson(dir, "package.json", {
      name: "x",
      scripts: { mcp: `node -e "console.log(process.cwd())"` },
    });
    mkdirSync(join(dir, "editors"));
    const { command, args } = reactorMcpServer;
    const output = execFileSync(command, args, {
      cwd: join(dir, "editors"),
      encoding: "utf8",
    });
    expect(realpathSync(output.trim())).toBe(realpathSync(dir));
  });

  it("leaves remote, already-migrated and unparseable entries alone", async () => {
    const dir = makeTempProject("ph-migrate-mcp-keep-");
    const remote = { type: "http", url: "https://switchboard.example/mcp" };
    writeJson(dir, ".mcp.json", { mcpServers: { "reactor-mcp": remote } });
    writeJson(dir, join(".cursor", "mcp.json"), {
      mcpServers: { other: httpEntry },
    });
    mkdirSync(join(dir, ".gemini"));
    writeFileSync(join(dir, ".gemini", "settings.json"), "{not json");

    expect(await migrateReactorMcpEntries(dir)).toEqual([]);
    expect(readServers(dir, ".mcp.json")).toEqual({ "reactor-mcp": remote });
    expect(readServers(dir, join(".cursor", "mcp.json"))).toEqual({
      other: httpEntry,
    });
  });

  it("is a no-op on a fresh scaffold", async () => {
    const dir = makeTempProject("ph-init-mcp-");
    await writeAiConfigFiles(dir);
    expect(await migrateReactorMcpEntries(dir)).toEqual([]);
  });
});
