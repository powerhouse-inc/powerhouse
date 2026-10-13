import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import {
  toUpperSnake,
  configKeyToEnvVar,
  resolveConfig,
  localConfigPath,
  userConfigPath,
  getMissingRequiredFields,
} from "../src/core/config.js";
import { getConfigEnvVars } from "../src/core/config.js";

describe("toUpperSnake", () => {
  it("converts simple camelCase", () => {
    expect(toUpperSnake("defaultPriority")).toBe("DEFAULT_PRIORITY");
  });

  it("converts single word", () => {
    expect(toUpperSnake("port")).toBe("PORT");
  });

  it("handles consecutive uppercase (acronyms)", () => {
    expect(toUpperSnake("apiURL")).toBe("API_URL");
  });

  it("handles acronym followed by word", () => {
    expect(toUpperSnake("apiURLParser")).toBe("API_URL_PARSER");
  });

  it("handles numbers", () => {
    expect(toUpperSnake("port8080Name")).toBe("PORT8080_NAME");
  });

  it("handles already uppercase", () => {
    expect(toUpperSnake("URL")).toBe("URL");
  });

  it("converts kebab-case", () => {
    expect(toUpperSnake("connect-agent")).toBe("CONNECT_AGENT");
  });

  it("converts kebab-case with multiple dashes", () => {
    expect(toUpperSnake("my-cool-app")).toBe("MY_COOL_APP");
  });
});

describe("configKeyToEnvVar", () => {
  it("prefixes with CLI name", () => {
    expect(configKeyToEnvVar("tasks", "defaultPriority")).toBe(
      "TASKS_DEFAULT_PRIORITY",
    );
  });

  it("converts cli name too", () => {
    expect(configKeyToEnvVar("myApp", "connectPort")).toBe(
      "MY_APP_CONNECT_PORT",
    );
  });

  it("handles kebab-case CLI names", () => {
    expect(configKeyToEnvVar("connect-agent", "apiKey")).toBe(
      "CONNECT_AGENT_API_KEY",
    );
  });
});

describe("getConfigEnvVars", () => {
  it("returns env var mappings for all config fields", () => {
    const schema = z.object({
      defaultPriority: z
        .enum(["low", "medium", "high"])
        .default("medium")
        .describe("Default priority"),
      maxItems: z.number().default(100).describe("Max items"),
    });
    const vars = getConfigEnvVars("tasks", schema);
    expect(vars).toEqual([
      {
        name: "TASKS_DEFAULT_PRIORITY",
        field: "defaultPriority",
        description: "Default priority",
      },
      {
        name: "TASKS_MAX_ITEMS",
        field: "maxItems",
        description: "Max items",
      },
    ]);
  });

  it("returns empty array for non-object schema", () => {
    const vars = getConfigEnvVars("cli", z.string() as any);
    expect(vars).toEqual([]);
  });

  it("uses empty description when field has none", () => {
    const schema = z.object({
      port: z.number().default(3000),
    });
    const vars = getConfigEnvVars("app", schema);
    expect(vars[0]!.description).toBe("");
  });
});

describe("resolveConfig", () => {
  let workDir: string;
  const originalEnv = { ...process.env };

  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), "ph-clint-cfg-"));
  });

  afterEach(async () => {
    // Restore env
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) {
        delete process.env[key];
      }
    }
    Object.assign(process.env, originalEnv);
    await rm(workDir, { recursive: true, force: true });
  });

  const schema = z.object({
    defaultPriority: z
      .enum(["low", "medium", "high"])
      .default("medium")
      .describe("Default priority"),
    maxItems: z.coerce.number().default(100).describe("Max items"),
  });

  it("applies Zod defaults when no overrides exist", () => {
    const config = resolveConfig({
      configSchema: schema,
      cliName: "tasks",
      workdir: workDir,
    });
    expect(config).toEqual({ defaultPriority: "medium", maxItems: 100 });
  });

  it("reads local workspace settings", async () => {
    const settingsDir = join(workDir, ".ph");
    await mkdir(settingsDir, { recursive: true });
    await writeFile(
      join(settingsDir, "tasks.config.local.json"),
      JSON.stringify({ defaultPriority: "high" }),
    );

    const config = resolveConfig({
      configSchema: schema,
      cliName: "tasks",
      workdir: workDir,
    });
    expect(config.defaultPriority).toBe("high");
    expect(config.maxItems).toBe(100); // default preserved
  });

  it("env vars override defaults", () => {
    process.env.TASKS_DEFAULT_PRIORITY = "low";

    const config = resolveConfig({
      configSchema: schema,
      cliName: "tasks",
      workdir: workDir,
    });
    expect(config.defaultPriority).toBe("low");
  });

  it("env vars override local settings", async () => {
    const settingsDir = join(workDir, ".ph");
    await mkdir(settingsDir, { recursive: true });
    await writeFile(
      join(settingsDir, "tasks.config.local.json"),
      JSON.stringify({ defaultPriority: "low" }),
    );
    process.env.TASKS_DEFAULT_PRIORITY = "high";

    const config = resolveConfig({
      configSchema: schema,
      cliName: "tasks",
      workdir: workDir,
    });
    expect(config.defaultPriority).toBe("high");
  });

  it("env vars take precedence over local config file", async () => {
    const settingsDir = join(workDir, ".ph");
    await mkdir(settingsDir, { recursive: true });
    await writeFile(
      join(settingsDir, "tasks.config.local.json"),
      JSON.stringify({ defaultPriority: "low" }),
    );
    process.env.TASKS_DEFAULT_PRIORITY = "high";

    const config = resolveConfig({
      configSchema: schema,
      cliName: "tasks",
      workdir: workDir,
    });
    expect(config.defaultPriority).toBe("high");
  });

  it("ignores missing settings files", () => {
    const config = resolveConfig({
      configSchema: schema,
      cliName: "tasks",
      workdir: "/nonexistent/path",
    });
    expect(config).toEqual({ defaultPriority: "medium", maxItems: 100 });
  });

  it("reads --config file (highest priority)", async () => {
    const configFile = join(workDir, "custom-config.json");
    await writeFile(configFile, JSON.stringify({ defaultPriority: "high" }));
    process.env.TASKS_DEFAULT_PRIORITY = "low";

    const config = resolveConfig({
      configSchema: schema,
      cliName: "tasks",
      workdir: workDir,
      configFile: configFile,
    });
    // --config flag overrides env vars
    expect(config.defaultPriority).toBe("high");
  });

  it("resolves --config path relative to cwd", async () => {
    const configFile = join(workDir, "my-config.json");
    await writeFile(configFile, JSON.stringify({ defaultPriority: "high" }));

    const config = resolveConfig({
      configSchema: schema,
      cliName: "tasks",
      workdir: "/some/other/path",
      configFile: "my-config.json",
      cwd: workDir,
    });
    expect(config.defaultPriority).toBe("high");
  });

  it("applies implementation defaults (layer 5)", () => {
    const config = resolveConfig({
      configSchema: schema,
      cliName: "tasks",
      workdir: workDir,
      implementationDefaults: { defaultPriority: "high" },
    });
    expect(config.defaultPriority).toBe("high");
  });

  it("local config overrides implementation defaults", async () => {
    const settingsDir = join(workDir, ".ph");
    await mkdir(settingsDir, { recursive: true });
    await writeFile(
      join(settingsDir, "tasks.config.local.json"),
      JSON.stringify({ defaultPriority: "low" }),
    );

    const config = resolveConfig({
      configSchema: schema,
      cliName: "tasks",
      workdir: workDir,
      implementationDefaults: { defaultPriority: "high" },
    });
    expect(config.defaultPriority).toBe("low");
  });
});

describe("localConfigPath", () => {
  it("returns correct path", () => {
    expect(localConfigPath("/home/user/project", "mycli")).toBe(
      join("/home/user/project", ".ph", "mycli.config.local.json"),
    );
  });
});

describe("userConfigPath", () => {
  it("returns path in home directory", () => {
    const path = userConfigPath("mycli");
    expect(path).toBe(join(homedir(), ".ph", "mycli.config.user.json"));
  });
});

describe("getMissingRequiredFields", () => {
  it("returns empty for schema with all defaults", () => {
    const schema = z.object({
      port: z.number().default(3000),
    });
    const missing = getMissingRequiredFields(schema, {});
    expect(missing).toEqual([]);
  });

  it("returns missing mandatory fields", () => {
    const schema = z.object({
      apiKey: z.string().describe("API key"),
      port: z.number().default(3000),
    });
    const missing = getMissingRequiredFields(schema, {});
    expect(missing).toEqual([{ key: "apiKey", description: "API key" }]);
  });

  it("returns empty when mandatory field has a value", () => {
    const schema = z.object({
      apiKey: z.string().describe("API key"),
    });
    const missing = getMissingRequiredFields(schema, { apiKey: "abc123" });
    expect(missing).toEqual([]);
  });

  it("returns empty for optional fields without values", () => {
    const schema = z.object({
      name: z.string().optional(),
    });
    const missing = getMissingRequiredFields(schema, {});
    expect(missing).toEqual([]);
  });

  it("uses empty string when field has no description", () => {
    const schema = z.object({
      secret: z.string(),
    });
    const missing = getMissingRequiredFields(schema, {});
    expect(missing).toEqual([{ key: "secret", description: "" }]);
  });
});
