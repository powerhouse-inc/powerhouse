// @ts-nocheck — NOTE(port): the ph-clint repo never typechecked its test suite
// (jest ran transpile-only); this file carries pre-existing type drift. Runtime
// assertions are unchanged. Tighten opportunistically when touching the file.
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  mkdtemp,
  rm,
  mkdir,
  writeFile,
  readFile,
  stat,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import {
  createConfigCommand,
  generateConfigCommandHelp,
} from "../src/core/config-command.js";
import { defineCommand } from "../src/core/command.js";
import { defineCli } from "../src/core/cli.js";
import { createMemoryWorkdirStore } from "../src/core/store.js";
import type { CommandContext } from "../src/core/types.js";

const configSchema = z.object({
  defaultPriority: z
    .enum(["low", "medium", "high"])
    .default("medium")
    .describe("Default priority for new tasks"),
  maxItems: z.coerce.number().default(100).describe("Maximum number of tasks"),
  apiKey: z.string().optional().describe("API key for external service"),
});

describe("createConfigCommand", () => {
  let workDir: string;
  const originalEnv = { ...process.env };

  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), "ph-clint-cfgcmd-"));
  });

  afterEach(async () => {
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) delete process.env[key];
    }
    Object.assign(process.env, originalEnv);
    await rm(workDir, { recursive: true, force: true });
  });

  function makeContext(workdir?: string): CommandContext {
    return {
      workdir: workdir ?? workDir,
      workspace: createMemoryWorkdirStore(),
      config: {},
      stdout: () => {},
    };
  }

  function makeCommand() {
    return createConfigCommand({
      cliName: "tasks",
      configSchema,
    });
  }

  describe("read mode", () => {
    it("shows resolved value with source (default)", async () => {
      const cmd = makeCommand();
      const result = (await cmd.execute(
        { name: "defaultPriority" },
        makeContext(),
      )) as { text: string };
      expect(result.text).toContain("defaultPriority");
      expect(result.text).toContain('"medium"');
      expect(result.text).toContain("default");
    });

    it("shows env var as source when set", async () => {
      process.env.TASKS_DEFAULT_PRIORITY = "high";
      const cmd = makeCommand();
      const result = (await cmd.execute(
        { name: "defaultPriority" },
        makeContext(),
      )) as { text: string };
      expect(result.text).toContain('"high"');
      expect(result.text).toContain("env TASKS_DEFAULT_PRIORITY");
    });

    it("shows local config as source when set", async () => {
      const settingsDir = join(workDir, ".ph");
      await mkdir(settingsDir, { recursive: true });
      await writeFile(
        join(settingsDir, "tasks.config.local.json"),
        JSON.stringify({ defaultPriority: "low" }),
      );
      const cmd = makeCommand();
      const result = (await cmd.execute(
        { name: "defaultPriority" },
        makeContext(),
      )) as { text: string };
      expect(result.text).toContain('"low"');
      expect(result.text).toContain("local");
    });

    it("reads from scope local", async () => {
      const settingsDir = join(workDir, ".ph");
      await mkdir(settingsDir, { recursive: true });
      await writeFile(
        join(settingsDir, "tasks.config.local.json"),
        JSON.stringify({ defaultPriority: "high" }),
      );
      const cmd = makeCommand();
      const result = (await cmd.execute(
        { name: "defaultPriority", scope: "local" },
        makeContext(),
      )) as { text: string };
      expect(result.text).toContain('"high"');
      expect(result.text).toContain("local");
    });

    it("reports not set when scope file has no value", async () => {
      const cmd = makeCommand();
      const result = (await cmd.execute(
        { name: "defaultPriority", scope: "local" },
        makeContext(),
      )) as { text: string };
      expect(result.text).toContain("not set");
      expect(result.text).toContain("local");
    });

    it("reads from scope user", async () => {
      const cmd = makeCommand();
      const result = (await cmd.execute(
        { name: "defaultPriority", scope: "user" },
        makeContext(),
      )) as { text: string };
      expect(result.text).toContain("defaultPriority");
    });

    it("reads from scope user when value is set", async () => {
      // Write to user config first, then read
      const cmd = makeCommand();
      await cmd.execute(
        { name: "defaultPriority", write: "high", scope: "user" },
        makeContext(),
      );
      const result = (await cmd.execute(
        { name: "defaultPriority", scope: "user" },
        makeContext(),
      )) as { text: string };
      expect(result.text).toContain('"high"');
      expect(result.text).toContain("user");

      // Clean up: remove from user config
      await cmd.execute(
        { name: "defaultPriority", remove: true, scope: "user" },
        makeContext(),
      );
    });

    it("shows user config as source in resolved read (no scope)", async () => {
      const cmd = makeCommand();
      // Write to user config
      await cmd.execute(
        { name: "defaultPriority", write: "low", scope: "user" },
        makeContext(),
      );
      // Read without scope — resolveSource should return 'user'
      const result = (await cmd.execute(
        { name: "defaultPriority" },
        makeContext(),
      )) as { text: string };
      expect(result.text).toContain('"low"');
      expect(result.text).toContain("user");

      // Clean up
      await cmd.execute(
        { name: "defaultPriority", remove: true, scope: "user" },
        makeContext(),
      );
    });

    it("reads from scope env", async () => {
      process.env.TASKS_DEFAULT_PRIORITY = "low";
      const cmd = makeCommand();
      const result = (await cmd.execute(
        { name: "defaultPriority", scope: "env" },
        makeContext(),
      )) as { text: string };
      expect(result.text).toContain('"low"');
      expect(result.text).toContain("env: TASKS_DEFAULT_PRIORITY");
    });

    it("reports not set for scope env when unset", async () => {
      const cmd = makeCommand();
      const result = (await cmd.execute(
        { name: "defaultPriority", scope: "env" },
        makeContext(),
      )) as { text: string };
      expect(result.text).toContain("not set");
      expect(result.text).toContain("TASKS_DEFAULT_PRIORITY");
    });

    it("reads from scope sys (schema default)", async () => {
      const cmd = makeCommand();
      const result = (await cmd.execute(
        { name: "defaultPriority", scope: "sys" },
        makeContext(),
      )) as { text: string };
      expect(result.text).toContain('"medium"');
      expect(result.text).toContain("system default");
    });

    it("reads from scope sys (implementation default)", async () => {
      const cmd = createConfigCommand({
        cliName: "tasks",
        configSchema,
        implementationDefaults: { defaultPriority: "low" },
      });
      const result = (await cmd.execute(
        { name: "defaultPriority", scope: "sys" },
        makeContext(),
      )) as { text: string };
      expect(result.text).toContain('"low"');
      expect(result.text).toContain("system default");
    });

    it("reports no system default for field without one", async () => {
      const cmd = makeCommand();
      const result = (await cmd.execute(
        { name: "apiKey", scope: "sys" },
        makeContext(),
      )) as { text: string };
      expect(result.text).toContain("no system default");
    });

    it("reads from scope args", async () => {
      const cmd = makeCommand();
      const result = (await cmd.execute(
        { name: "defaultPriority", scope: "args" },
        makeContext(),
      )) as { text: string };
      expect(result.text).toContain("args scope");
    });
  });

  describe("write mode", () => {
    it("writes to local config by default", async () => {
      const cmd = makeCommand();
      const result = (await cmd.execute(
        { name: "defaultPriority", write: "high" },
        makeContext(),
      )) as { text: string };
      expect(result.text).toContain("defaultPriority");
      expect(result.text).toContain('"high"');
      expect(result.text).toContain("local");

      const filePath = join(workDir, ".ph", "tasks.config.local.json");
      const data = JSON.parse(await readFile(filePath, "utf-8"));
      expect(data.defaultPriority).toBe("high");
    });

    const itPosix = process.platform === "win32" ? it.skip : it;

    itPosix("writes 0600 when a sensitive key is present", async () => {
      const cmd = createConfigCommand({
        cliName: "tasks",
        configSchema,
        sensitiveKeys: new Set(["apiKey"]),
      });
      await cmd.execute(
        { name: "apiKey", write: "secret-value" },
        makeContext(),
      );
      const filePath = join(workDir, ".ph", "tasks.config.local.json");
      const mode = (await stat(filePath)).mode & 0o777;
      expect(mode).toBe(0o600);
    });

    itPosix("does not force 0600 for a non-sensitive key", async () => {
      const cmd = createConfigCommand({
        cliName: "tasks",
        configSchema,
        sensitiveKeys: new Set(["apiKey"]),
      });
      await cmd.execute(
        { name: "defaultPriority", write: "high" },
        makeContext(),
      );
      const filePath = join(workDir, ".ph", "tasks.config.local.json");
      const mode = (await stat(filePath)).mode & 0o777;
      expect(mode).not.toBe(0o600);
    });

    itPosix(
      "keeps 0600 after removing a non-secret while a secret remains",
      async () => {
        const cmd = createConfigCommand({
          cliName: "tasks",
          configSchema,
          sensitiveKeys: new Set(["apiKey"]),
        });
        await cmd.execute(
          { name: "apiKey", write: "secret-value" },
          makeContext(),
        );
        await cmd.execute({ name: "maxItems", write: "5" }, makeContext());
        await cmd.execute({ name: "maxItems", remove: true }, makeContext());
        const filePath = join(workDir, ".ph", "tasks.config.local.json");
        const mode = (await stat(filePath)).mode & 0o777;
        expect(mode).toBe(0o600);
      },
    );

    it("writes number values correctly", async () => {
      const cmd = makeCommand();
      const result = (await cmd.execute(
        { name: "maxItems", write: "50" },
        makeContext(),
      )) as { text: string };
      expect(result.text).toContain("50");

      const filePath = join(workDir, ".ph", "tasks.config.local.json");
      const data = JSON.parse(await readFile(filePath, "utf-8"));
      expect(data.maxItems).toBe(50);
    });

    it("merges with existing config file", async () => {
      const settingsDir = join(workDir, ".ph");
      await mkdir(settingsDir, { recursive: true });
      await writeFile(
        join(settingsDir, "tasks.config.local.json"),
        JSON.stringify({ defaultPriority: "low" }),
      );

      const cmd = makeCommand();
      await cmd.execute({ name: "maxItems", write: "25" }, makeContext());

      const filePath = join(workDir, ".ph", "tasks.config.local.json");
      const data = JSON.parse(await readFile(filePath, "utf-8"));
      expect(data.defaultPriority).toBe("low"); // preserved
      expect(data.maxItems).toBe(25); // added
    });

    it("rejects invalid enum value", async () => {
      const cmd = makeCommand();
      await expect(
        cmd.execute(
          { name: "defaultPriority", write: "invalid" },
          makeContext(),
        ),
      ).rejects.toThrow("Invalid value");
    });

    it("rejects write to non-writable scope", async () => {
      const cmd = makeCommand();
      await expect(
        cmd.execute(
          { name: "defaultPriority", write: "high", scope: "env" },
          makeContext(),
        ),
      ).rejects.toThrow('Cannot write to scope "env"');
    });

    it("writes to local scope explicitly", async () => {
      const cmd = makeCommand();
      const result = (await cmd.execute(
        { name: "defaultPriority", write: "low", scope: "local" },
        makeContext(),
      )) as { text: string };
      expect(result.text).toContain("local");
    });

    it("writes boolean values correctly (true)", async () => {
      const boolSchema = z.object({
        verbose: z.boolean().default(false).describe("Enable verbose output"),
      });
      const cmd = createConfigCommand({
        cliName: "test",
        configSchema: boolSchema,
      });
      const result = (await cmd.execute(
        { name: "verbose", write: "true" },
        makeContext(),
      )) as { text: string };
      expect(result.text).toContain("true");

      const filePath = join(workDir, ".ph", "test.config.local.json");
      const data = JSON.parse(await readFile(filePath, "utf-8"));
      expect(data.verbose).toBe(true);
    });

    it('coerces boolean with "1" and "yes"', async () => {
      const boolSchema = z.object({
        verbose: z.boolean().default(false).describe("Enable verbose output"),
      });
      const cmd1 = createConfigCommand({
        cliName: "test1",
        configSchema: boolSchema,
      });
      await cmd1.execute({ name: "verbose", write: "1" }, makeContext());
      const file1 = join(workDir, ".ph", "test1.config.local.json");
      expect(JSON.parse(await readFile(file1, "utf-8")).verbose).toBe(true);

      const cmd2 = createConfigCommand({
        cliName: "test2",
        configSchema: boolSchema,
      });
      await cmd2.execute({ name: "verbose", write: "yes" }, makeContext());
      const file2 = join(workDir, ".ph", "test2.config.local.json");
      expect(JSON.parse(await readFile(file2, "utf-8")).verbose).toBe(true);

      const cmd3 = createConfigCommand({
        cliName: "test3",
        configSchema: boolSchema,
      });
      await cmd3.execute({ name: "verbose", write: "no" }, makeContext());
      const file3 = join(workDir, ".ph", "test3.config.local.json");
      expect(JSON.parse(await readFile(file3, "utf-8")).verbose).toBe(false);
    });

    it("shows configFile as source when value comes from --config", async () => {
      const configFile = join(workDir, "custom.json");
      await writeFile(configFile, JSON.stringify({ defaultPriority: "high" }));

      const cmd = createConfigCommand({
        cliName: "tasks",
        configSchema,
        configFile,
      });
      const result = (await cmd.execute(
        { name: "defaultPriority" },
        makeContext(),
      )) as { text: string };
      expect(result.text).toContain('"high"');
      expect(result.text).toContain("--config file");
    });

    it("falls through configFile when key not in file", async () => {
      const configFile = join(workDir, "partial.json");
      await writeFile(configFile, JSON.stringify({ maxItems: 50 }));

      const cmd = createConfigCommand({
        cliName: "tasks",
        configSchema,
        configFile,
      });
      const result = (await cmd.execute(
        { name: "defaultPriority" },
        makeContext(),
      )) as { text: string };
      expect(result.text).toContain("default");
    });

    it("shows implementation defaults as source", async () => {
      const cmd = createConfigCommand({
        cliName: "tasks",
        configSchema,
        implementationDefaults: { defaultPriority: "low" },
      });
      const result = (await cmd.execute(
        { name: "defaultPriority" },
        makeContext(),
      )) as { text: string };
      expect(result.text).toContain('"low"');
    });
  });

  describe("remove mode", () => {
    it("removes a setting from local config", async () => {
      const settingsDir = join(workDir, ".ph");
      await mkdir(settingsDir, { recursive: true });
      await writeFile(
        join(settingsDir, "tasks.config.local.json"),
        JSON.stringify({ defaultPriority: "high", maxItems: 50 }),
      );

      const cmd = makeCommand();
      const result = (await cmd.execute(
        { name: "defaultPriority", remove: true },
        makeContext(),
      )) as { text: string };
      expect(result.text).toContain("Removed");
      expect(result.text).toContain("defaultPriority");
      expect(result.text).toContain("local");

      const filePath = join(workDir, ".ph", "tasks.config.local.json");
      const data = JSON.parse(await readFile(filePath, "utf-8"));
      expect(data.defaultPriority).toBeUndefined();
      expect(data.maxItems).toBe(50); // preserved
    });

    it("reports not set when removing absent key", async () => {
      const cmd = makeCommand();
      const result = (await cmd.execute(
        { name: "defaultPriority", remove: true },
        makeContext(),
      )) as { text: string };
      expect(result.text).toContain("not set");
    });

    it("removes from user scope", async () => {
      const cmd = makeCommand();
      const result = (await cmd.execute(
        { name: "defaultPriority", remove: true, scope: "user" },
        makeContext(),
      )) as { text: string };
      expect(result.text).toContain("user");
    });

    it("rejects remove from non-writable scope", async () => {
      const cmd = makeCommand();
      await expect(
        cmd.execute(
          { name: "defaultPriority", remove: true, scope: "env" },
          makeContext(),
        ),
      ).rejects.toThrow('Cannot remove from scope "env"');
    });
  });

  describe("list mode", () => {
    it("lists all settings with resolved values", async () => {
      const cmd = makeCommand();
      const result = (await cmd.execute({ list: true }, makeContext())) as {
        text: string;
      };
      expect(result.text).toContain("defaultPriority");
      expect(result.text).toContain("maxItems");
      expect(result.text).toContain("apiKey");
    });

    it("lists settings from a specific scope", async () => {
      process.env.TASKS_DEFAULT_PRIORITY = "high";
      const cmd = makeCommand();
      const result = (await cmd.execute(
        { list: true, scope: "env" },
        makeContext(),
      )) as { text: string };
      expect(result.text).toContain("defaultPriority");
      expect(result.text).toContain('"high"');
      // Fields not set in env show as (not set)
      expect(result.text).toContain("(not set)");
    });

    it("shows <error> when config resolution fails for a field", async () => {
      // Schema with a required field and no default — resolveConfig will throw
      const strictSchema = z.object({
        apiKey: z.string().describe("API key"),
      });
      const cmd = createConfigCommand({
        cliName: "strict",
        configSchema: strictSchema,
      });
      const result = (await cmd.execute({ list: true }, makeContext())) as {
        text: string;
      };
      // resolveConfig fails because apiKey is required but not provided
      expect(result.text).toContain("<error>");
    });

    it("rejects --list with --name", async () => {
      const cmd = makeCommand();
      await expect(
        cmd.execute({ list: true, name: "defaultPriority" }, makeContext()),
      ).rejects.toThrow("--list does not accept --name");
    });
  });

  describe("validation", () => {
    it("rejects --list with --write", async () => {
      const cmd = makeCommand();
      await expect(
        cmd.execute({ list: true, write: "high" }, makeContext()),
      ).rejects.toThrow("mutually exclusive");
    });

    it("rejects --list with --remove", async () => {
      const cmd = makeCommand();
      await expect(
        cmd.execute({ list: true, remove: true }, makeContext()),
      ).rejects.toThrow("mutually exclusive");
    });

    it("rejects --write with --remove", async () => {
      const cmd = makeCommand();
      await expect(
        cmd.execute(
          { name: "defaultPriority", write: "high", remove: true },
          makeContext(),
        ),
      ).rejects.toThrow("mutually exclusive");
    });

    it("requires --name when not using --list", async () => {
      const cmd = makeCommand();
      await expect(cmd.execute({}, makeContext())).rejects.toThrow(
        "--name is required",
      );
    });
  });

  describe("input schema", () => {
    it("has name as optional enum of config field keys", () => {
      const cmd = makeCommand();
      const parsed = cmd.inputSchema.parse({
        name: "defaultPriority",
      }) as Record<string, unknown>;
      expect(parsed.name).toBe("defaultPriority");
    });

    it("accepts input without name (for list mode)", () => {
      const cmd = makeCommand();
      const parsed = cmd.inputSchema.parse({ list: true }) as Record<
        string,
        unknown
      >;
      expect(parsed.list).toBe(true);
      expect(parsed.name).toBeUndefined();
    });

    it("accepts any string for name at parse time (validated in execute)", () => {
      const cmd = makeCommand();
      // z.string() accepts any name — validation happens in execute()
      const parsed = cmd.inputSchema.parse({ name: "nonexistent" }) as Record<
        string,
        unknown
      >;
      expect(parsed.name).toBe("nonexistent");
    });

    it("accepts all scope values", () => {
      const cmd = makeCommand();
      for (const scope of ["args", "env", "local", "user", "sys"]) {
        const parsed = cmd.inputSchema.parse({
          name: "defaultPriority",
          scope,
        }) as Record<string, unknown>;
        expect(parsed.scope).toBe(scope);
      }
    });
  });
});

describe("generateConfigCommandHelp", () => {
  it("includes all three sections", () => {
    const help = generateConfigCommandHelp("tasks", configSchema, "/tmp/test");
    expect(help).toContain("Location and Resolution");
    expect(help).toContain("Settings");
    expect(help).toContain("Workdir");
  });

  it("lists options in Commander format", () => {
    const help = generateConfigCommandHelp("tasks", configSchema, "/tmp/test");
    expect(help).toContain("-n, --name <setting>");
    expect(help).toContain("-w, --write <value>");
    expect(help).toContain("-r, --remove");
    expect(help).toContain("-l, --list");
    expect(help).toContain("-s, --scope <scope>");
  });

  it("shows scope values for read and write/remove", () => {
    const help = generateConfigCommandHelp("tasks", configSchema, "/tmp/test");
    expect(help).toContain("args | env | local | user | sys");
    expect(help).toContain("Write/Remove: local | user");
  });

  it("includes usage examples", () => {
    const help = generateConfigCommandHelp("tasks", configSchema, "/tmp/test");
    expect(help).toContain("Examples:");
    expect(help).toContain("tasks config --list");
    expect(help).toContain("tasks config --name watchDir --write");
    expect(help).toContain("tasks config --name watchDir --remove");
  });

  it("lists all config fields", () => {
    const help = generateConfigCommandHelp("tasks", configSchema, "/tmp/test");
    expect(help).toContain("defaultPriority");
    expect(help).toContain("maxItems");
    expect(help).toContain("apiKey");
  });

  it("shows env var names", () => {
    const help = generateConfigCommandHelp("tasks", configSchema, "/tmp/test");
    expect(help).toContain("TASKS_DEFAULT_PRIORITY");
    expect(help).toContain("TASKS_MAX_ITEMS");
    expect(help).toContain("TASKS_API_KEY");
  });

  it("shows descriptions", () => {
    const help = generateConfigCommandHelp("tasks", configSchema, "/tmp/test");
    expect(help).toContain("Default priority for new tasks");
    expect(help).toContain("Maximum number of tasks");
  });

  it("shows field types and defaults", () => {
    const help = generateConfigCommandHelp("tasks", configSchema, "/tmp/test");
    expect(help).toContain('Default: "medium"');
    expect(help).toContain("Default: 100");
    expect(help).toContain("optional");
  });

  it("shows 5-layer resolution chain", () => {
    const help = generateConfigCommandHelp("tasks", configSchema, "/tmp/test");
    expect(help).toContain("--config");
    expect(help).toContain("Environment vars");
    expect(help).toContain("TASKS_{FIELD_NAME}");
    expect(help).toContain("Local config");
    expect(help).toContain("User config");
    expect(help).toContain("System defaults");
  });

  it("uses --write and --remove in resolution text", () => {
    const help = generateConfigCommandHelp("tasks", configSchema, "/tmp/test");
    expect(help).toContain("--write and --remove");
  });

  it("uses em dash notation for settings", () => {
    const help = generateConfigCommandHelp("tasks", configSchema, "/tmp/test");
    expect(help).toContain("defaultPriority — Default priority for new tasks");
    expect(help).toContain("maxItems — Maximum number of tasks");
  });

  it("uses actual local config path with workdir", () => {
    const help = generateConfigCommandHelp(
      "tasks",
      configSchema,
      "/my/project",
    );
    expect(help).toContain(
      path.join("/my/project", ".ph", "tasks.config.local.json"),
    );
  });

  it("shows workdir resolution order", () => {
    const help = generateConfigCommandHelp("tasks", configSchema, "/tmp/test");
    expect(help).toContain("process.cwd()");
    expect(help).toContain("--workdir");
    expect(help).toContain("Implementation override");
    expect(help).toContain("Current: /tmp/test");
  });

  it("explains workdir is not a config parameter", () => {
    const help = generateConfigCommandHelp("tasks", configSchema, "/tmp/test");
    expect(help).toContain("NOT a config");
    expect(help).toContain("prerequisite for config resolution");
  });
});

describe("env var name resolution", () => {
  let workDir: string;
  const originalEnv = { ...process.env };

  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), "ph-clint-envvar-"));
  });

  afterEach(async () => {
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) delete process.env[key];
    }
    Object.assign(process.env, originalEnv);
    await rm(workDir, { recursive: true, force: true });
  });

  function makeContext(): CommandContext {
    return {
      workdir: workDir,
      workspace: createMemoryWorkdirStore(),
      config: {},
      stdout: () => {},
    };
  }

  it("resolves UPPER_SNAKE env var name to camelCase field", async () => {
    const cmd = createConfigCommand({ cliName: "my-cli", configSchema });
    const result = (await cmd.execute(
      { name: "MY_CLI_DEFAULT_PRIORITY" },
      makeContext(),
    )) as { text: string };
    expect(result.text).toContain("defaultPriority");
    expect(result.text).toContain('"medium"');
  });

  it("resolves lowercase env var name (case-insensitive)", async () => {
    const cmd = createConfigCommand({ cliName: "my-cli", configSchema });
    const result = (await cmd.execute(
      { name: "my_cli_max_items" },
      makeContext(),
    )) as { text: string };
    expect(result.text).toContain("maxItems");
  });

  it("still resolves camelCase field names directly", async () => {
    const cmd = createConfigCommand({ cliName: "my-cli", configSchema });
    const result = (await cmd.execute({ name: "apiKey" }, makeContext())) as {
      text: string;
    };
    expect(result.text).toContain("apiKey");
  });

  it("throws helpful error for unknown names", async () => {
    const cmd = createConfigCommand({ cliName: "my-cli", configSchema });
    await expect(
      cmd.execute({ name: "NONEXISTENT_VAR" }, makeContext()),
    ).rejects.toThrow('Unknown setting "NONEXISTENT_VAR"');
  });

  it("error message lists both field names and env var names", async () => {
    const cmd = createConfigCommand({ cliName: "my-cli", configSchema });
    try {
      await cmd.execute({ name: "NOPE" }, makeContext());
    } catch (err) {
      const msg = (err as Error).message;
      expect(msg).toContain("defaultPriority");
      expect(msg).toContain("MY_CLI_DEFAULT_PRIORITY");
    }
  });

  it("write mode works with env var name", async () => {
    const cmd = createConfigCommand({ cliName: "my-cli", configSchema });
    const result = (await cmd.execute(
      { name: "MY_CLI_MAX_ITEMS", write: "42" },
      makeContext(),
    )) as { text: string };
    expect(result.text).toContain("Set maxItems = 42");
  });
});

describe("config command conditional injection", () => {
  it("injects config command when schema has fields", () => {
    const cli = defineCli({
      name: "test-with-config",
      version: "1.0.0",
      description: "test",
      configSchema: z.object({ foo: z.string().default("bar") }),
      commands: [],
    });
    const meta = cli.getMetadata();
    expect("config" in meta.commands).toBe(true);
  });

  it("does not inject config command when schema has no fields", () => {
    const cli = defineCli({
      name: "test-empty-config",
      version: "1.0.0",
      description: "test",
      configSchema: z.object({}),
      commands: [],
    });
    const meta = cli.getMetadata();
    expect("config" in meta.commands).toBe(false);
  });

  it("does not inject config command when no schema provided", () => {
    const cli = defineCli({
      name: "test-no-config",
      version: "1.0.0",
      description: "test",
      commands: [],
    });
    const meta = cli.getMetadata();
    expect("config" in meta.commands).toBe(false);
  });
});

describe("generateConfigCommandHelp with required field", () => {
  it("shows required marker for mandatory fields", () => {
    const schemaWithRequired = z.object({
      apiKey: z.string().describe("API key for service"),
      port: z.number().default(3000).describe("Port number"),
    });
    const help = generateConfigCommandHelp(
      "myapp",
      schemaWithRequired,
      "/tmp/test",
    );
    expect(help).toContain("required");
    expect(help).toContain("API key for service");
  });

  it("handles field without description", () => {
    const schemaNoDesc = z.object({
      port: z.number().default(3000),
    });
    const help = generateConfigCommandHelp("myapp", schemaNoDesc, "/tmp/test");
    expect(help).toContain("port");
    expect(help).toContain("Default: 3000");
  });
});

describe("config command integration via defineCli", () => {
  let workDir: string;

  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), "ph-clint-cfgint-"));
  });

  afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
  });

  function capture() {
    const output: string[] = [];
    const errors: string[] = [];
    let exitCode: number | undefined;
    return {
      output,
      errors,
      get exitCode() {
        return exitCode;
      },
      options: {
        stdout: (msg: string) => output.push(msg),
        stderr: (msg: string) => errors.push(msg),
        exit: (code: number) => {
          exitCode = code;
        },
      },
    };
  }

  const schema = z.object({
    defaultPriority: z
      .enum(["low", "medium", "high"])
      .default("medium")
      .describe("Default priority for new tasks"),
  });

  it("auto-injects config command when configSchema is present", () => {
    const cli = defineCli({
      name: "tasks",
      version: "1.0.0",
      description: "Task tracker",
      configSchema: schema,
      commands: [
        defineCommand({
          id: "add",
          description: "Add task",
          inputSchema: z.object({}),
          execute: async () => "ok",
        }),
      ],
    });
    expect(cli.getCommand("config")).toBeDefined();
  });

  it("does not inject config when no configSchema", () => {
    const cli = defineCli({
      name: "tasks",
      version: "1.0.0",
      description: "Task tracker",
      commands: [
        defineCommand({
          id: "add",
          description: "Add task",
          inputSchema: z.object({}),
          execute: async () => "ok",
        }),
      ],
    });
    expect(cli.getCommand("config")).toBeUndefined();
  });

  it("does not override user-defined config command", () => {
    const customConfig = defineCommand({
      id: "config",
      description: "Custom config",
      inputSchema: z.object({}),
      execute: async () => "custom",
    });
    const cli = defineCli({
      name: "tasks",
      version: "1.0.0",
      description: "Task tracker",
      configSchema: schema,
      commands: [customConfig],
    });
    expect(cli.getCommand("config")!.description).toBe("Custom config");
  });

  it("config command appears in help", () => {
    const cli = defineCli({
      name: "tasks",
      version: "1.0.0",
      description: "Task tracker",
      configSchema: schema,
      commands: [
        defineCommand({
          id: "add",
          description: "Add task",
          inputSchema: z.object({}),
          execute: async () => "ok",
        }),
      ],
    });
    const help = cli.generateHelp();
    expect(help).toContain("config");
    expect(help).toContain("View or modify configuration settings");
  });

  it("config command help shows detailed page", () => {
    const cli = defineCli({
      name: "tasks",
      version: "1.0.0",
      description: "Task tracker",
      configSchema: schema,
      commands: [],
    });
    const help = cli.generateCommandHelp("config");
    expect(help).toContain("Location and Resolution");
    expect(help).toContain("Settings");
    expect(help).toContain("Workdir");
  });

  it("runs config read via CLI run()", async () => {
    const cli = defineCli({
      name: "tasks",
      version: "1.0.0",
      description: "Task tracker",
      configSchema: schema,
      commands: [],
    });
    const cap = capture();
    await cli.run(["node", "tasks", "config", "--name", "defaultPriority"], {
      ...cap.options,
      workdir: workDir,
    });
    expect(cap.output.join("")).toContain("defaultPriority");
    expect(cap.output.join("")).toContain("medium");
  });

  it("runs config write via CLI run()", async () => {
    const cli = defineCli({
      name: "tasks",
      version: "1.0.0",
      description: "Task tracker",
      configSchema: schema,
      commands: [],
    });
    const cap = capture();
    await cli.run(
      [
        "node",
        "tasks",
        "config",
        "--name",
        "defaultPriority",
        "--write",
        "high",
      ],
      { ...cap.options, workdir: workDir },
    );
    expect(cap.output.join("")).toContain("high");

    const filePath = join(workDir, ".ph", "tasks.config.local.json");
    const data = JSON.parse(await readFile(filePath, "utf-8"));
    expect(data.defaultPriority).toBe("high");
  });

  it("runs config list via CLI run()", async () => {
    const cli = defineCli({
      name: "tasks",
      version: "1.0.0",
      description: "Task tracker",
      configSchema: schema,
      commands: [],
    });
    const cap = capture();
    await cli.run(["node", "tasks", "config", "--list"], {
      ...cap.options,
      workdir: workDir,
    });
    expect(cap.output.join("")).toContain("defaultPriority");
  });

  it("runs config remove via CLI run()", async () => {
    const cli = defineCli({
      name: "tasks",
      version: "1.0.0",
      description: "Task tracker",
      configSchema: schema,
      commands: [],
    });
    // First write a value
    const cap1 = capture();
    await cli.run(
      [
        "node",
        "tasks",
        "config",
        "--name",
        "defaultPriority",
        "--write",
        "high",
      ],
      { ...cap1.options, workdir: workDir },
    );
    // Then remove it
    const cap2 = capture();
    await cli.run(
      ["node", "tasks", "config", "--name", "defaultPriority", "--remove"],
      { ...cap2.options, workdir: workDir },
    );
    expect(cap2.output.join("")).toContain("Removed");

    const filePath = join(workDir, ".ph", "tasks.config.local.json");
    const data = JSON.parse(await readFile(filePath, "utf-8"));
    expect(data.defaultPriority).toBeUndefined();
  });
});
