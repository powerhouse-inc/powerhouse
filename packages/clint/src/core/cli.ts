import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { Command as Commander } from "commander";
import { z } from "zod";
import type {
  AgentLoader,
  BootstrapOptions,
  BootstrapResult,
  Cli,
  CliMetadata,
  CliOptions,
  Command,
  CommandContext,
  ConfigEnvVar,
  Resolvable,
  ResolvedInteractiveConfig,
  Routine,
  RunOptions,
  ServiceDefinition,
} from "./types.js";
import type {
  ReactorConfiguration,
  DocumentRegistry,
  AnyRegistry,
} from "../integrations/powerhouse/types.js";
import { connectServiceDefinition } from "../integrations/powerhouse/connect.js";
import { resolveReactorDefaults } from "../integrations/powerhouse/ports.js";
import { randomUUID } from "node:crypto";
import { formatStreamChunk } from "./stream.js";
import { getSchemaFields, slugToTitle, type FieldInfo } from "./schema.js";
import { createMemoryWorkdirStore, createWorkdirStore } from "./store.js";
import { getConfigEnvVars, resolveConfig, userStoreFolder } from "./config.js";
import { resolveWorkdir } from "./workdir.js";
import {
  createConfigCommand,
  generateConfigCommandHelp,
} from "./config-command.js";
import { createServiceCommands } from "./service-command.js";
import { resolveServiceName } from "./services.js";
import { createHelpCommand } from "./help-command.js";
import { installSkills } from "./init.js";
import { readSkills } from "./skills.js";
import type { SkillInfo } from "./skills.js";
import {
  createSkillCommands,
  isSkillInvocation,
  DEFAULT_SKILL_INSTRUCTION,
} from "./skill-commands.js";
import type { SkillInvocation } from "./skill-commands.js";
import { renderSkillTemplate } from "./templates.js";
import { createRoutine } from "./routine.js";
import { createEventBus } from "./events.js";
import { createProcessManager } from "./processes.js";
import { createServiceManager } from "./services.js";
import {
  createRoutineServiceAdapter,
  createCompositeServiceManager,
} from "./routine-service.js";
import { createReplSession } from "../interactive/session.js";
import { formatZodError } from "./errors.js";
import { createLogger } from "./logger.js";
import { createProxyServer, type ProxyServerInstance } from "./proxy.js";
import {
  buildServiceRoutes,
  resolveImplicitProxyRoot,
} from "./proxy-routes.js";
import { createCliRuntime } from "./runtime.js";
import { initLifecycle } from "./lifecycle.js";
import type { BootTimings, LifecycleInitContext } from "./types.js";

/* istanbul ignore next -- fallback stdout used only when running without RunOptions (real terminal) */
const defaultStdout = (text: string) => {
  process.stdout.write(text);
};

/** Fully-resolved run options — no optionals for process defaults. Internal to defineCli. */
interface ResolvedRunOptions {
  exit: (code: number) => void;
  stdout: (message: string) => void;
  stderr: (message: string) => void;
  cwd: string;
  writeRaw: (text: string) => void;
  configFile?: string;
  resume?: string;
  interactiveInput?: AsyncIterable<string>;
  logLevel?: import("./types.js").LogLevel;
}

/**
 * Format a command result for output.
 * If the result has a `.text` string property, use that.
 * Otherwise, convert to string.
 */
function formatResult(result: unknown): string | undefined {
  if (result === undefined || result === null) return undefined;
  if (
    typeof result === "object" &&
    result !== null &&
    "text" in result &&
    typeof (result as Record<string, unknown>).text === "string"
  ) {
    return (result as Record<string, unknown>).text as string;
  }
  return String(result);
}

/**
 * Resolve a Resolvable<T> value — call it if it's a function, return it otherwise.
 */
function resolveValue<T, C>(
  value: Resolvable<T, C>,
  ctx: { workdir: string; config: C },
): T {
  return typeof value === "function"
    ? (value as (ctx: { workdir: string; config: C }) => T)(ctx)
    : value;
}

/**
 * Define a CLI — the top-level entry point.
 *
 * When a `configSchema` is provided, TSchema is inferred automatically,
 * giving typed `config` in agent factories, `Resolvable` callbacks, and
 * interactive config.
 */
export function defineCli<
  TSchema extends import("zod").ZodType = import("zod").ZodType<
    Record<string, unknown>
  >,
  TSecrets extends import("zod").ZodType = import("zod").ZodType<
    Record<string, unknown>
  >,
>(options: CliOptions<TSchema, TSecrets>): Cli {
  // Merged config type — used internally after secrets are folded in
  type TMerged = import("zod").infer<TSchema> & import("zod").infer<TSecrets>;

  // Merge secretsSchema into configSchema and track secret keys
  const sensitiveKeys = new Set<string>();
  if (options.secretsSchema && options.configSchema) {
    const secretsObj = options.secretsSchema as any;
    for (const key of Object.keys(secretsObj.shape)) {
      sensitiveKeys.add(key);
    }
    const configObj = options.configSchema as any;
    options = {
      ...options,
      configSchema: configObj.merge(secretsObj) as unknown as TSchema,
    };
  }

  // Auto-inject proxy config fields when enabled
  if (options.proxyEnabled && options.configSchema) {
    const proxySchema = z.object({
      proxyPort: z.coerce.number().default(0),
      proxyHost: z.string().default("0.0.0.0"),
      // Browser-facing base URL when deployed behind an ingress
      // (env: {CLINAME}_PROXY_PUBLIC_URL). See ProxyServerOptions.publicUrl.
      // A non-root pathname mounts the whole surface under that base path.
      // The .url() check accepts scheme-less values like 'localhost:8090'
      // (parsed with protocol 'localhost:'); resolveServiceProxyContext
      // requires http(s) and treats anything else as unset.
      proxyPublicUrl: z.string().url().optional(),
    });
    const configObj = options.configSchema as any;
    options = {
      ...options,
      configSchema: configObj.merge(proxySchema) as unknown as TSchema,
    };
  }

  // Merge lifecycle hook config schema fragments. Plugin-contributed fields
  // flow through the 6-layer resolver, getConfigEnvVars(), and `cli config`
  // with the standard {CLINAME}_{FIELD_NAME} env-var naming convention.
  // Type-inference scope: TConfig still reflects the user's declared schema.
  // Plugins read their own fields from ctx.config typed against their own schema.
  if (
    options.lifecycle &&
    options.lifecycle.length > 0 &&
    options.configSchema
  ) {
    let merged = options.configSchema as any;
    for (const hook of options.lifecycle) {
      if (hook.configSchema) {
        merged = merged.merge(hook.configSchema);
      }
    }
    if (merged !== options.configSchema) {
      options = { ...options, configSchema: merged as unknown as TSchema };
    }
  }

  const commandMap = new Map<string, Command>();
  for (const cmd of options.commands) {
    commandMap.set(cmd.id, cmd);
  }

  // Track config file path for the config command (set during run())
  let activeConfigFile: string | undefined;
  let activeWorkdir: string = process.cwd();

  // Auto-inject built-in config command when configSchema has at least one field
  const configFieldCount = options.configSchema
    ? getSchemaFields(options.configSchema).length
    : 0;
  if (configFieldCount > 0 && !commandMap.has("config")) {
    const configCmd = createConfigCommand({
      cliName: options.name,
      configSchema: options.configSchema!,
      sensitiveKeys,
      implementationDefaults: options.configDefaults,
      // configFile is set lazily during run() via activeConfigFile
      get configFile() {
        return activeConfigFile;
      },
    });
    commandMap.set("config", configCmd);
  }

  // If triggers/routine config provided, create shared runtime services
  const hasTriggers = options.triggers && options.triggers.length > 0;
  const hasServices = options.services && options.services.length > 0;

  // Auto-inject per-service commands when services are defined
  // serviceGroups maps command ID → { name, description } for help grouping
  const serviceGroups = new Map<
    string,
    { name: string; description?: string }
  >();
  if (hasServices) {
    for (const svcDef of options.services!) {
      const cmds = createServiceCommands(svcDef);
      const svcGroup = {
        name: resolveServiceName(svcDef),
        description: svcDef.description,
      };
      for (const cmd of cmds) {
        if (!commandMap.has(cmd.id)) commandMap.set(cmd.id, cmd);
        serviceGroups.set(cmd.id, svcGroup);
      }
    }
  }

  // Auto-inject built-in help command — uses lazy getCli() since the Cli object
  // is created at the end of defineCli, but execute() is only called at runtime.
  let cliRef: Cli | undefined; // eslint-disable-line prefer-const -- assigned below after runtime wiring
  if (!commandMap.has("cli-docs")) {
    commandMap.set(
      "cli-docs",
      createHelpCommand({
        getCli: () => cliRef!,
      }),
    );
  }

  // Read skill metadata and register skill commands
  let resolvedSkills: SkillInfo[] = [];
  if (options.prompts && options.prompts.artifacts.length > 0) {
    resolvedSkills = readSkills(options.prompts.artifacts);
    const skillCmds = createSkillCommands(
      resolvedSkills,
      options.prompts.skills,
    );
    for (const cmd of skillCmds) {
      if (!commandMap.has(cmd.id)) commandMap.set(cmd.id, cmd);
    }
  }
  const skillIds = new Set(resolvedSkills.map((s) => s.name));

  // Lazy singleton event bus — created on first access, shared everywhere.
  // This eliminates the dual-path wiring that caused stale references when
  // services were added after defineCli() (e.g. configureReactor adding Connect).
  let _eventBus: ReturnType<typeof createEventBus> | undefined;
  function getEventBus(): ReturnType<typeof createEventBus> {
    if (!_eventBus) _eventBus = createEventBus();
    return _eventBus;
  }
  const eventBus = hasTriggers || hasServices ? getEventBus() : undefined;
  const processManager = createProcessManager();
  let routine: Routine | undefined;

  // RoutineServiceAdapter for auto-injected service commands
  let routineServiceAdapter: import("./types.js").ServiceManager | undefined;

  if (hasTriggers) {
    routine = createRoutine({
      triggers: options.triggers!,
      commands: commandMap,
      tickInterval: options.routine?.tickInterval,
      idleInterval: options.routine?.idleInterval,
      eventBus,
      processManager,
    });

    // Auto-inject service commands for the routine when id is configured
    if (options.routine?.id) {
      const routineConfig = options.routine;
      // Build a synthetic ServiceDefinition for createServiceCommands
      const routineName = routineConfig.name ?? slugToTitle(routineConfig.id!);
      const syntheticDef: import("./types.js").ServiceDefinition = {
        id: routineConfig.id!,
        name: routineName,
        command: "",
        maxInstances: 1,
        ...(routineConfig.projectScanner && {
          projectScanner: routineConfig.projectScanner,
        }),
      };
      const cmds = createServiceCommands(syntheticDef);
      const svcGroup = { name: routineName };
      for (const cmd of cmds) {
        if (!commandMap.has(cmd.id)) commandMap.set(cmd.id, cmd);
        serviceGroups.set(cmd.id, svcGroup);
      }

      // Create the adapter (used later when wiring up context.services)
      routineServiceAdapter = createRoutineServiceAdapter(
        routine,
        routineConfig,
        eventBus,
      );
    }
  }

  // Mutable agent factory — set via configureAgent()
  let agentLoader: AgentLoader<any> | undefined;

  function configureAgent(loader: AgentLoader<any>): void {
    agentLoader = loader;
  }

  // Mutable reactor configuration — set via configureReactor()
  let reactorConfig: ReactorConfiguration | undefined;

  function configureReactor<R extends DocumentRegistry = AnyRegistry>(
    config: ReactorConfiguration<R>,
  ): void {
    // Stamp port/name defaults from CLI name before anything else
    const resolved = resolveReactorDefaults(options.name, config);
    if (resolved.switchboard)
      config = { ...config, switchboard: resolved.switchboard };
    if (resolved.connect) config = { ...config, connect: resolved.connect };

    // Auto-resolve Connect workdir and assetsDir from CLI root
    if (config.connect?.enabled && options.root) {
      const connect = { ...config.connect };
      if (!connect.workdir) {
        connect.workdir = resolveAppPackageDir(options.root, options.name);
      }
      if (connect.assetsDir === undefined && connect.workdir) {
        const candidateDir = path.join(connect.workdir, "dist", "connect");
        if (fs.existsSync(path.join(candidateDir, "index.html"))) {
          connect.assetsDir = candidateDir;
        }
      }
      config = { ...config, connect };
    }

    // Erase R at the storage site — at runtime the registry is just a dict.
    // The generic only exists to type-check the caller's `create` factory.
    reactorConfig = config as unknown as ReactorConfiguration;

    // Inject Connect service commands immediately
    if (config.connect?.enabled) {
      const def = connectServiceDefinition(config.connect);
      for (const cmd of createServiceCommands(def)) {
        if (!commandMap.has(cmd.id)) commandMap.set(cmd.id, cmd);
      }
      // Store the service definition for ServiceManager registration in run()
      if (!options.services) options.services = [];
      (options.services as any[]).push(def);
    }
  }

  function getCommand(id: string): Command | undefined {
    return commandMap.get(id);
  }

  function listCommands(): Command[] {
    return [...commandMap.values()];
  }

  function buildContext(base?: Partial<CommandContext>): CommandContext {
    const noop = () => Promise.resolve({ success: true, output: "" });
    const ctx: CommandContext = {
      workdir: process.cwd(),
      workspace: createMemoryWorkdirStore(),
      config: options.configSchema
        ? (options.configSchema.parse({}) as Record<string, unknown>)
        : {},
      stdout: defaultStdout,
      runProcess: noop,
      ...base,
    };
    // Extend with runtime services if available
    if (routine) ctx.routine = routine;
    ctx.processes = processManager;
    // Wire runProcess to use ctx's current stdout (may be intercepted by session)
    ctx.runProcess = (cmd, opts) =>
      processManager.run(cmd, {
        ...opts,
        onOutput: (line) => ctx.stdout(line + "\n"),
      });
    // Always wire emit/on through getEventBus() — late-bound so the bus is
    // created on demand even if services are added after defineCli().
    ctx.emit = (event: string, data?: unknown) =>
      getEventBus().emit(event, data);
    ctx.on = (event: string, handler: (data?: unknown) => void) =>
      getEventBus().on(event, handler);
    return ctx;
  }

  async function execute(
    commandId: string,
    args: Record<string, unknown>,
    context?: CommandContext,
  ): Promise<unknown> {
    const cmd = commandMap.get(commandId);
    if (!cmd) {
      throw new Error(`Unknown command: ${commandId}`);
    }
    let parsed;
    try {
      parsed = cmd.inputSchema.parse(args);
    } catch (err) {
      throw new Error(formatZodError(err, commandId));
    }
    const ctx = buildContext(context);
    return cmd.execute(parsed, ctx);
  }

  function parseArgs(
    commandId: string,
    argv: string[],
  ): Record<string, unknown> {
    const cmd = commandMap.get(commandId);
    if (!cmd) {
      throw new Error(`Unknown command: ${commandId}`);
    }

    const fields = getSchemaFields(cmd.inputSchema);
    const positionalKeys = cmd.positional ?? [];
    const positionalSet = new Set(positionalKeys);
    const result: Record<string, unknown> = {};
    let positionalIdx = 0;

    for (let i = 0; i < argv.length; i++) {
      const arg = argv[i]!;

      if (!arg.startsWith("--")) {
        if (positionalIdx >= positionalKeys.length) {
          throw new Error(`Unexpected argument: ${arg}`);
        }
        const key = positionalKeys[positionalIdx]!;
        result[key] = arg;
        positionalIdx++;
        continue;
      }

      const flagName = arg.slice(2);
      const field = fields.find((f) => f.key === flagName);
      if (!field) {
        throw new Error(`Unknown option: ${arg}`);
      }
      if (positionalSet.has(flagName)) {
        throw new Error(
          `Option --${flagName} is positional; pass it by position instead`,
        );
      }

      if (field.baseType === "boolean") {
        result[field.key] = true;
      } else {
        const nextArg = argv[i + 1];
        if (nextArg === undefined || nextArg.startsWith("--")) {
          throw new Error(`Missing value for ${arg}`);
        }
        result[field.key] = nextArg;
        i++;
      }
    }

    // Apply defaults for missing fields
    for (const field of fields) {
      if (field.key in result) continue;
      if (field.hasDefault) {
        result[field.key] = field.defaultValue;
      } else if (!field.isOptional) {
        if (positionalSet.has(field.key)) {
          throw new Error(`Missing required argument: <${field.key}>`);
        }
        throw new Error(`Missing required option: --${field.key}`);
      }
    }

    return result;
  }

  function generateHelp(): string {
    const desc = resolveValue(options.description, {
      workdir: activeWorkdir,
      config: {} as TMerged,
    });
    const lines: string[] = [];
    lines.push(`${options.name} v${options.version}`);
    lines.push("");
    lines.push(desc);
    lines.push("");
    if (options.interactive) {
      lines.push("Options:");
      lines.push("  -i, --interactive    Start interactive REPL mode");
      lines.push("");
    }
    // Group commands: regular, per-service, skills
    const allCmds = [...commandMap.values()];
    const regularCmds = allCmds.filter(
      (c) => !skillIds.has(c.id) && !serviceGroups.has(c.id),
    );
    const skillCmds = allCmds.filter((c) => skillIds.has(c.id));

    // Collect service groups preserving definition order
    const svcNameOrder: string[] = [];
    const svcCmdsByName = new Map<
      string,
      { group: { name: string; description?: string }; cmds: Command[] }
    >();
    for (const cmd of allCmds) {
      const group = serviceGroups.get(cmd.id);
      if (!group) continue;
      if (!svcCmdsByName.has(group.name)) {
        svcNameOrder.push(group.name);
        svcCmdsByName.set(group.name, { group, cmds: [] });
      }
      svcCmdsByName.get(group.name)!.cmds.push(cmd);
    }

    lines.push("Commands:");
    for (const cmd of regularCmds) {
      lines.push(`  ${cmd.id.padEnd(36)} ${cmd.description}`);
    }

    for (const name of svcNameOrder) {
      const entry = svcCmdsByName.get(name)!;
      lines.push("");
      lines.push(`${entry.group.name}:`);
      if (entry.group.description) {
        lines.push(`  ${entry.group.description}`);
        lines.push("");
      }
      for (const cmd of entry.cmds) {
        lines.push(`  ${cmd.id.padEnd(36)} ${cmd.description}`);
      }
    }

    if (skillCmds.length > 0) {
      lines.push("");
      lines.push(`Skills (run "${options.name} help <skill>" for details):`);
      for (const cmd of skillCmds) {
        lines.push(`  ${cmd.id.padEnd(36)} ${cmd.description}`);
      }
    }
    lines.push("");

    const configHelp = generateConfigHelp();
    if (configHelp) {
      lines.push(configHelp);
    }
    return lines.join("\n");
  }

  function generateConfigHelp(): string | undefined {
    if (!options.configSchema) return undefined;
    const envVars = configEnvVars();
    /* istanbul ignore next -- configSchema always has at least one field when present */
    if (envVars.length === 0) return undefined;
    const fields = getSchemaFields(options.configSchema, sensitiveKeys);

    const lines: string[] = [];
    lines.push("Configuration:");
    for (let i = 0; i < envVars.length; i++) {
      const ev = envVars[i]!;
      const field = fields[i];
      const parts: string[] = [`  ${ev.name}`];
      if (ev.description) parts.push(`  ${ev.description}`);
      if (field?.hasDefault)
        parts.push(`(default: ${JSON.stringify(field.defaultValue)})`);
      if (field && !field.isOptional && !field.hasDefault)
        parts.push("(required)");
      lines.push(parts.join("  "));
    }
    lines.push("");
    return lines.join("\n");
  }

  function generateCommandHelp(commandId: string): string {
    const cmd = commandMap.get(commandId);
    if (!cmd) {
      throw new Error(`Unknown command: ${commandId}`);
    }

    // Rich help page for the built-in config command
    if (commandId === "config" && options.configSchema) {
      return generateConfigCommandHelp(
        options.name,
        options.configSchema,
        activeWorkdir,
        sensitiveKeys,
      );
    }

    // Rich help page for skill commands
    if (skillIds.has(commandId)) {
      const skill = resolvedSkills.find((s) => s.name === commandId);
      const lines: string[] = [];
      lines.push(`Skill: ${commandId}`);
      lines.push("");
      lines.push(cmd.description);
      lines.push("");

      const fields = getSchemaFields(cmd.inputSchema);
      const positionalSet = new Set(cmd.positional ?? []);
      if (fields.length > 0) {
        lines.push("Parameters:");
        for (const field of fields) {
          const isPositional = positionalSet.has(field.key);
          const label = isPositional
            ? field.isOptional || field.hasDefault
              ? `[${field.key}]`
              : `<${field.key}>`
            : `--${field.key}`;
          const parts: string[] = [`  ${label}`];
          parts.push(field.description ?? "");
          if (field.hasDefault)
            parts.push(`(default: ${JSON.stringify(field.defaultValue)})`);
          if (!field.isOptional) parts.push("(required)");
          lines.push(parts.join("  "));
        }
        lines.push("");
      }

      // Append .cli-docs.md content if available
      if (skill?.cliDocsPath) {
        try {
          const docsContent = fs
            .readFileSync(skill.cliDocsPath, "utf-8")
            .trim();
          if (docsContent) {
            lines.push(docsContent);
            lines.push("");
          }
        } catch {
          // Skip unreadable docs
        }
      }

      return lines.join("\n");
    }

    const fields = getSchemaFields(cmd.inputSchema);
    const positionalKeys = cmd.positional ?? [];
    const positionalSet = new Set(positionalKeys);

    const lines: string[] = [];
    const usageParts = [`${options.name}`, cmd.id];
    for (const key of positionalKeys) {
      const field = fields.find((f) => f.key === key);
      if (!field) continue;
      const isOptional = field.isOptional || field.hasDefault;
      usageParts.push(isOptional ? `[${key}]` : `<${key}>`);
    }
    const flagFields = fields.filter((f) => !positionalSet.has(f.key));
    if (flagFields.length > 0) {
      usageParts.push("[options]");
    }
    lines.push(`Usage: ${usageParts.join(" ")}`);
    lines.push("");
    lines.push(cmd.description);
    lines.push("");

    if (positionalKeys.length > 0) {
      lines.push("Arguments:");
      for (const key of positionalKeys) {
        const field = fields.find((f) => f.key === key);
        if (!field) continue;
        const isOptional = field.isOptional || field.hasDefault;
        const label = isOptional ? `[${field.key}]` : `<${field.key}>`;
        const parts: string[] = [`  ${label}`];
        parts.push(field.description ?? "");
        if (field.hasDefault) {
          parts.push(`(default: ${JSON.stringify(field.defaultValue)})`);
        }
        lines.push(parts.join("  "));
      }
      lines.push("");
    }

    if (flagFields.length > 0) {
      lines.push("Options:");
      for (const field of flagFields) {
        const parts: string[] = [`  --${field.key}`];
        parts.push(field.description ?? "");
        if (field.hasDefault) {
          parts.push(`(default: ${JSON.stringify(field.defaultValue)})`);
        }
        if (!field.isOptional) {
          parts.push("(required)");
        }
        lines.push(parts.join("  "));
      }
    }
    lines.push("");
    return lines.join("\n");
  }

  function generateCompletion(shell: string): string {
    const commandNames = [...commandMap.keys()].join(" ");
    if (shell === "bash") {
      return [
        `# bash completion for ${options.name}`,
        `_${options.name}_completions() {`,
        `  local commands="${commandNames}"`,
        `  COMPREPLY=($(compgen -W "$commands" -- "\${COMP_WORDS[COMP_CWORD]}")`,
        `}`,
        `complete -F _${options.name}_completions ${options.name}`,
      ].join("\n");
    }
    if (shell === "zsh") {
      return [
        `#compdef ${options.name}`,
        `_${options.name}() {`,
        `  local commands=(${commandNames})`,
        `  _describe 'command' commands`,
        `}`,
        `compdef _${options.name} ${options.name}`,
      ].join("\n");
    }
    if (shell === "fish") {
      const lines = [`# fish completion for ${options.name}`];
      for (const name of commandMap.keys()) {
        lines.push(
          `complete -c ${options.name} -n '__fish_use_subcommand' -a '${name}'`,
        );
      }
      return lines.join("\n");
    }
    throw new Error(`Unsupported shell: ${shell}`);
  }

  function configEnvVars(): ConfigEnvVar[] {
    if (!options.configSchema) return [];
    return getConfigEnvVars(options.name, options.configSchema);
  }

  function buildProgram(
    stdout: (msg: string) => void,
    context: CommandContext,
    resolvedDescription: string,
    onSkillInvocation?: (invocation: SkillInvocation) => Promise<void>,
    wraps?: import("./types.js").WrapRegistry,
  ): Commander {
    const program = new Commander();
    program
      .name(options.name)
      .version(options.version)
      .description(resolvedDescription)
      .enablePositionalOptions()
      .exitOverride()
      .configureOutput({
        writeOut: (str) => stdout(str.trimEnd()),
        writeErr: (str) => stdout(str.trimEnd()),
      });

    if (options.interactive) {
      program.option("-i, --interactive", "Start interactive REPL mode");
    }

    if (hasTriggers) {
      program.option("-R, --no-routine", "Skip routine activation");
    }

    if (reactorConfig?.switchboard?.enabled) {
      program.option("-A, --no-api", "Skip API (switchboard) activation");
    }

    if (reactorConfig?.connect?.enabled) {
      program.option("-S, --no-studio", "Skip Studio (connect) activation");
    }

    program.option("--verbose", "Enable debug-level logging");
    program.option("--meta", "Output CLI metadata as JSON");

    if (agentLoader) {
      program.option("--resume <thread-id>", "Resume a previous conversation");
    }

    // --workdir is available unless the implementation overrides it
    if (!options.workdir) {
      program.option("-w, --workdir <path>", "Set the workspace directory");
    }

    if (configFieldCount > 0) {
      program.option(
        "-c, --config <path>",
        "Load config from a JSON file (relative to cwd)",
      );
    }

    // Shorthand aliases for the built-in config command
    const configShorthands: Record<string, string> = {
      name: "-n",
      write: "-w",
      remove: "-r",
      list: "-l",
      scope: "-s",
    };

    for (const cmd of commandMap.values()) {
      // Skip cli-docs — it exists in commandMap only so the agent gets it as a tool.
      // Commander's built-in `help` handles CLI users.
      if (cmd.id === "cli-docs") continue;

      const isSkill = skillIds.has(cmd.id);
      const isHidden = isSkill || serviceGroups.has(cmd.id);
      const sub = program
        .command(cmd.id, { hidden: isHidden })
        .description(cmd.description);
      const isBuiltinConfig = cmd.id === "config" && options.configSchema;

      const fields = getSchemaFields(cmd.inputSchema);
      const positionalKeys = cmd.positional ?? [];
      const positionalSet = new Set(positionalKeys);

      // Register positional arguments in declared order
      for (const key of positionalKeys) {
        const field = fields.find((f) => f.key === key);
        if (!field) continue;
        const isOptional = field.isOptional || field.hasDefault;
        const spec = isOptional ? `[${field.key}]` : `<${field.key}>`;
        sub.argument(spec, field.description ?? "");
      }

      for (const field of fields) {
        if (positionalSet.has(field.key)) continue;
        const desc = field.description ?? "";
        const shorthand = isBuiltinConfig
          ? configShorthands[field.key]
          : undefined;
        const longFlag = `--${field.key}`;
        const flag = shorthand ? `${shorthand}, ${longFlag}` : longFlag;

        if (field.baseType === "boolean") {
          sub.option(
            flag,
            desc,
            field.hasDefault ? (field.defaultValue as boolean) : false,
          );
        } else if (field.isOptional) {
          sub.option(
            `${flag} <value>`,
            desc,
            field.hasDefault ? String(field.defaultValue) : undefined,
          );
        } else {
          sub.requiredOption(`${flag} <value>`, desc);
        }
      }

      // Override help for the built-in config command with a rich help page
      if (isBuiltinConfig) {
        sub.helpInformation = () =>
          generateConfigCommandHelp(
            options.name,
            options.configSchema!,
            activeWorkdir,
            sensitiveKeys,
          ) + "\n";
      }

      // Override help for skill commands with rich help page (includes .cli-docs.md)
      if (isSkill) {
        sub.helpInformation = () => generateCommandHelp(cmd.id) + "\n";
      }

      sub.action(async (...actionArgs: unknown[]) => {
        // Commander passes positional args first, then opts, then the Command instance.
        // Slice off the trailing Command instance to isolate positionals + opts.
        const trailing = actionArgs.slice(0, -1);
        const opts = (trailing[positionalKeys.length] ?? {}) as Record<
          string,
          unknown
        >;
        const merged: Record<string, unknown> = { ...opts };
        for (let i = 0; i < positionalKeys.length; i++) {
          const key = positionalKeys[i]!;
          const value = trailing[i];
          if (value !== undefined) {
            merged[key] = value;
          }
        }
        let parsed;
        try {
          parsed = cmd.inputSchema.parse(merged);
        } catch (err) {
          throw new Error(formatZodError(err, cmd.id));
        }
        // Wrap the execution through the registered wrap registry. Identity
        // when no lifecycle hook is registered — pure passthrough.
        const result = wraps
          ? await wraps.command(cmd.id, () => cmd.execute(parsed, context))
          : await cmd.execute(parsed, context);
        if (isSkillInvocation(result)) {
          if (onSkillInvocation) {
            await onSkillInvocation(result);
          } else {
            stdout(
              `Skill: ${result.skillName}` +
                (result.userMessage ? ` — ${result.userMessage}` : ""),
            );
          }
          return;
        }
        const output = formatResult(result);
        if (output !== undefined) {
          stdout(output);
        }
      });
    }

    // Append grouped service + skills sections to Commander's --help
    const groupedLines: string[] = [];

    // Service groups
    const allCmds = [...commandMap.values()];
    const svcNameOrder: string[] = [];
    const svcCmdsByName = new Map<
      string,
      { group: { name: string; description?: string }; cmds: Command[] }
    >();
    for (const cmd of allCmds) {
      const group = serviceGroups.get(cmd.id);
      if (!group) continue;
      if (!svcCmdsByName.has(group.name)) {
        svcNameOrder.push(group.name);
        svcCmdsByName.set(group.name, { group, cmds: [] });
      }
      svcCmdsByName.get(group.name)!.cmds.push(cmd);
    }
    for (const name of svcNameOrder) {
      const entry = svcCmdsByName.get(name)!;
      groupedLines.push("");
      groupedLines.push(`${entry.group.name}:`);
      if (entry.group.description) {
        groupedLines.push(`  ${entry.group.description}`);
        groupedLines.push("");
      }
      for (const cmd of entry.cmds) {
        groupedLines.push(`  ${cmd.id.padEnd(36)} ${cmd.description}`);
      }
    }

    // Skills
    const skillCmds = allCmds.filter((c) => skillIds.has(c.id));
    if (skillCmds.length > 0) {
      groupedLines.push("");
      groupedLines.push(
        `Skills (run "${options.name} help <skill>" for details):`,
      );
      for (const cmd of skillCmds) {
        groupedLines.push(`  ${cmd.id.padEnd(36)} ${cmd.description}`);
      }
    }

    if (groupedLines.length > 0) {
      program.addHelpText("after", groupedLines.join("\n"));
    }

    const configHelp = generateConfigHelp();
    if (configHelp) {
      program.addHelpText("after", "\n" + configHelp);
    }

    return program;
  }

  /**
   * Wire up ServiceManager (process + routine), event handlers, and proxy
   * event wiring onto a freshly-built context.  Shared by bootstrap() and
   * the interactive-mode startup in runImpl().
   */
  function wireServices(
    context: CommandContext,
    config: Record<string, unknown>,
    log: import("./types.js").Logger,
    proxyInstance?: ProxyServerInstance,
  ): void {
    const servicesNow = options.services && options.services.length > 0;
    let processServiceManager: import("./types.js").ServiceManager | undefined;
    if (servicesNow && options.services) {
      const svcDir = userStoreFolder(options.name, "services");
      processServiceManager = createServiceManager(options.services as any[], {
        config,
        servicesDir: svcDir,
        eventBus: getEventBus(),
      });
    }

    if (processServiceManager && routineServiceAdapter) {
      const routeMap = new Map<string, import("./types.js").ServiceManager>();
      for (const svc of options.services!) {
        routeMap.set(svc.id, processServiceManager);
      }
      routeMap.set(options.routine!.id!, routineServiceAdapter);
      context.services = createCompositeServiceManager(
        [processServiceManager, routineServiceAdapter],
        routeMap,
      );
    } else if (processServiceManager) {
      context.services = processServiceManager;
    } else if (routineServiceAdapter) {
      context.services = routineServiceAdapter;
    }

    if (_eventBus && options.events) {
      for (const [event, handler] of Object.entries(options.events)) {
        _eventBus.on(event, (data: unknown) => handler(data, log));
      }
    }

    // Proxy route wiring via event bus
    if (proxyInstance) {
      // All definitions (including the reactor-config Connect, pushed into
      // options.services by configureReactor) are known here, so the implicit
      // root resolves deterministically regardless of startup order.
      const implicitRoot = resolveImplicitProxyRoot(
        (options.services ?? []) as ServiceDefinition[],
      );
      if (implicitRoot) {
        log.debug(
          `Proxy: '${implicitRoot.serviceId}/${implicitRoot.captureName}' is the only website capture — serving it at '/' (set proxyRoot to make this explicit)`,
        );
      }
      const bus = getEventBus();
      bus.on("service:ready", (data: any) => {
        if (!data?.id || !context.services) return;
        const def = context.services.getDefinition(data.id);
        if (!def) return;
        const instances = context.services.list(data.id);
        const inst = instances.find((i) => i.instanceId === data.instanceId);
        if (!inst) return;
        const routes = buildServiceRoutes(def, inst, implicitRoot, log);
        for (const route of routes) {
          proxyInstance.addRoute(route);
        }
      });
      bus.on("service:stopped", (data: any) => {
        if (data?.id) proxyInstance.removeRoutesBySource(`service:${data.id}`);
      });
      bus.on("service:failed", (data: any) => {
        if (data?.id) proxyInstance.removeRoutesBySource(`service:${data.id}`);
      });

      // Wire proxy routes for services that are already running from a previous session
      if (context.services) {
        for (const inst of context.services.list()) {
          if (inst.status !== "ready" || !inst.endpoints) continue;
          const def = context.services.getDefinition(inst.serviceId);
          if (!def) continue;
          const routes = buildServiceRoutes(def, inst, implicitRoot, log);
          for (const route of routes) {
            proxyInstance.addRoute(route);
          }
        }
      }
    }
  }

  /**
   * Initialize the CLI runtime without entering the dispatch loop.
   * Returns resolved workdir, config, context, and lazy agent accessor.
   */
  async function bootstrap(opts?: BootstrapOptions): Promise<BootstrapResult> {
    const bootTimings: BootTimings = {
      bootStartedAt: Date.now(),
      configResolvedAt: 0,
      lifecycleInitStartedAt: 0,
    };

    const stdoutFn =
      opts?.stdout ??
      ((msg: string) => {
        console.log(msg);
      });
    const stderrFn =
      opts?.stderr ??
      ((msg: string) => {
        console.error(msg);
      });
    const cwd = process.cwd();

    // Resolve workdir: explicit override > implementation override > cwd
    const workdir = opts?.workdir
      ? resolveWorkdir({ implementationOverride: opts.workdir })
      : resolveWorkdir({
          implementationOverride: options.workdir,
          fallback: cwd,
        });
    activeWorkdir = workdir;

    // Context store lives at {workdir}/.ph/{cli-name}/
    const workspace = createWorkdirStore(workdir, options.name);

    // Auto-initialize store and install skills on first use
    if (options.prompts && options.prompts.artifacts.length > 0) {
      const storeRoot = workspace.getStoreFolder();
      if (!fs.existsSync(storeRoot)) {
        fs.mkdirSync(storeRoot, { recursive: true });
        const dbFolder = workspace.getStoreFolder(".mastra/db");
        fs.mkdirSync(dbFolder, { recursive: true });
        installSkills({
          store: workspace,
          skillArtifacts: options.prompts.artifacts,
          stdout: () => {},
        });
      }
    }

    // Resolve config through 6 layers
    const config = options.configSchema
      ? resolveConfig({
          configSchema: options.configSchema,
          cliName: options.name,
          workdir,
          configFile: opts?.configFile,
          cwd,
          implementationDefaults: options.configDefaults,
        })
      : {};
    bootTimings.configResolvedAt = Date.now();

    const logLevel = opts?.logLevel ?? "info";
    const log = createLogger(logLevel, stderrFn);
    const context = buildContext({
      workdir,
      workspace,
      config,
      stdout: stdoutFn,
      log,
    });

    wireServices(context, config, log);

    // Run lifecycle hooks after config resolves, before runtime construction.
    // Identity wraps when no hook is registered; otherwise composed contributions.
    bootTimings.lifecycleInitStartedAt = Date.now();
    const lifecycleCtx: LifecycleInitContext = {
      config,
      cliName: options.name,
      cliVersion: options.version,
      log,
      eventBus: getEventBus(),
      userStoreFolder: userStoreFolder(options.name),
      isInteractive: process.stdin.isTTY === true,
      bootTimings,
    };
    const lifecycle = await initLifecycle(
      options.lifecycle ?? [],
      lifecycleCtx,
    );

    const runtime = createCliRuntime({
      cliName: options.name,
      cliVersion: options.version,
      workdir,
      workspace,
      config,
      context,
      log,
      commandMap,
      agentLoader,
      skillIds,
      resolvedSkills,
      prompts: options.prompts,
      wraps: lifecycle.wraps,
      lifecycleShutdown: lifecycle.shutdown,
    });

    context.agent = runtime.getAgent;

    return {
      workdir,
      config,
      context,
      getAgent: runtime.getAgent,
      get mastraAgent() {
        return runtime.getAgent().then((p) => p?.mastraAgent);
      },
    };
  }

  /**
   * Public entry point — fills in process defaults, then delegates to runImpl.
   */
  async function run(argv: string[], runOptions?: RunOptions): Promise<void> {
    /* istanbul ignore next -- process defaults only used when running as a real CLI */
    const resolved: ResolvedRunOptions = {
      exit: runOptions?.exit ?? ((code: number) => process.exit(code)),
      stdout:
        runOptions?.stdout ??
        ((msg: string) => {
          console.log(msg);
        }),
      stderr:
        runOptions?.stderr ??
        ((msg: string) => {
          console.error(msg);
        }),
      cwd: runOptions?.workdir ?? process.cwd(),
      writeRaw: runOptions?.stdout ?? defaultStdout,
      configFile: runOptions?.configFile,
      resume: runOptions?.resume,
      interactiveInput: runOptions?.interactiveInput,
      logLevel: runOptions?.logLevel,
    };
    return runImpl(argv, resolved);
  }

  /**
   * Internal run with fully-resolved options — no process globals, fully testable.
   */
  async function runImpl(
    argv: string[],
    opts: ResolvedRunOptions,
  ): Promise<void> {
    const bootTimings: BootTimings = {
      bootStartedAt: Date.now(),
      configResolvedAt: 0,
      lifecycleInitStartedAt: 0,
    };

    const { exit, stdout, stderr, cwd, writeRaw } = opts;

    // ── Extract pre-command framework flags ────────────────────────
    // Framework flags (--workdir, --config, --resume, -i) are extracted from
    // args that appear BEFORE the subcommand name, to set up context before
    // Commander runs.  Commander (with enablePositionalOptions) handles the
    // scoping natively — post-subcommand options belong to the subcommand —
    // so we pass argv through unmodified.
    //   rupert --workdir ws vetra-start --workdir proj
    //          ^^^^^^^^^^^              ^^^^^^^^^^^^^^
    //          framework flag           subcommand flag (Commander scopes it)
    const userArgs = argv.slice(2);
    const subcommandNames = new Set([...commandMap.keys(), "help"]);
    let subcommandIdx = userArgs.findIndex((a) => subcommandNames.has(a));
    if (subcommandIdx === -1) subcommandIdx = userArgs.length;
    const preCommandArgs = userArgs.slice(0, subcommandIdx);

    // Extract framework flag values from pre-command args only
    let workdirFlag: string | undefined;
    let configFileFlag: string | undefined = opts.configFile;
    let resumeId: string | undefined = opts.resume;
    let interactiveFlag = false;
    let verboseFlag = false;
    let metaFlag = false;
    let noRoutineFlag = false;
    let noApiFlag = false;
    let noStudioFlag = false;
    const frameworkFlags = new Set([
      "--resume",
      "--workdir",
      "-w",
      "--config",
      "-c",
    ]);
    for (let i = 0; i < preCommandArgs.length; i++) {
      const arg = preCommandArgs[i]!;
      if (arg === "-i" || arg === "--interactive") {
        interactiveFlag = true;
      } else if (arg === "--verbose") {
        verboseFlag = true;
      } else if (arg === "--meta") {
        metaFlag = true;
      } else if (arg === "-R" || arg === "--no-routine") {
        noRoutineFlag = true;
      } else if (arg === "-A" || arg === "--no-api") {
        noApiFlag = true;
      } else if (arg === "-S" || arg === "--no-studio") {
        noStudioFlag = true;
      } else if (frameworkFlags.has(arg) && i + 1 < preCommandArgs.length) {
        const value = preCommandArgs[i + 1]!;
        if (arg === "--workdir" || arg === "-w") workdirFlag = value;
        else if (arg === "--config" || arg === "-c") configFileFlag = value;
        else if (arg === "--resume") resumeId = value;
        i++; // skip value
      }
    }

    // Resolve workdir: implementation override > --workdir flag > cwd
    const workdir = resolveWorkdir({
      implementationOverride: options.workdir,
      cliFlag: workdirFlag,
      fallback: cwd,
    });

    // Update active state for the config command
    activeWorkdir = workdir;
    activeConfigFile = configFileFlag;

    // Context store lives at {workdir}/.ph/{cli-name}/
    const workspace = createWorkdirStore(workdir, options.name);

    // Auto-initialize store and install skills on first use
    if (options.prompts && options.prompts.artifacts.length > 0) {
      const storeRoot = workspace.getStoreFolder();
      if (!fs.existsSync(storeRoot)) {
        fs.mkdirSync(storeRoot, { recursive: true });
        const dbFolder = workspace.getStoreFolder(".mastra/db");
        fs.mkdirSync(dbFolder, { recursive: true });
        installSkills({
          store: workspace,
          skillArtifacts: options.prompts.artifacts,
          stdout: verboseFlag ? stderr : () => {},
        });
      }
    }

    // Resolve config through 6 layers
    const config = options.configSchema
      ? resolveConfig({
          configSchema: options.configSchema,
          cliName: options.name,
          workdir,
          configFile: configFileFlag,
          cwd,
          implementationDefaults: options.configDefaults,
        })
      : {};
    bootTimings.configResolvedAt = Date.now();
    const logLevel = opts.logLevel ?? (verboseFlag ? "debug" : "info");
    const log = createLogger(logLevel, stderr);
    const context = buildContext({
      workdir,
      workspace,
      config,
      stdout: writeRaw,
      log,
    });

    // One-shot detection — before the proxy bind so one-shot invocations skip
    // it (they take the lazy dispatch and start no services).
    const postCmdArgs = userArgs.slice(subcommandIdx);
    const firstSubcmd = postCmdArgs[0];
    const isSubcommand =
      firstSubcmd && (commandMap.has(firstSubcmd) || firstSubcmd === "help");
    // --help/--version are Commander built-ins.
    const isBuiltinFlag = preCommandArgs.some(
      (a) => a === "--help" || a === "-h" || a === "--version" || a === "-V",
    );
    const willRunOneShot =
      !interactiveFlag && (isSubcommand || isBuiltinFlag || metaFlag);

    // Embedded proxy — skipped for one-shot invocations.
    let proxyInstance: ProxyServerInstance | undefined;
    if (options.proxyEnabled && !willRunOneShot) {
      const proxyPort = (config as any).proxyPort ?? 0;
      const proxyHost = (config as any).proxyHost ?? "0.0.0.0";
      const proxyPublicUrl = (config as any).proxyPublicUrl as
        | string
        | undefined;
      proxyInstance = await createProxyServer({
        port: proxyPort,
        host: proxyHost,
        publicUrl: proxyPublicUrl,
        logger: log,
      });
      for (const route of options.proxyRoutes ?? []) {
        try {
          proxyInstance.addRoute({
            // Request paths always start with '/'; normalize so a bare
            // 'preview' prefix doesn't silently never match.
            prefix: route.prefix.startsWith("/")
              ? route.prefix
              : `/${route.prefix}`,
            upstream: new URL(route.upstream),
            ws: route.ws ?? false,
            source: "static",
          });
        } catch (err) {
          log.warn(
            `Invalid proxyRoutes entry '${route.prefix}': ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
      const proxy = proxyInstance;
      context.proxy = {
        url: proxy.url,
        port: proxy.port,
        routes: () =>
          proxy.getRoutes().map((r) => ({
            prefix: r.prefix,
            upstream: r.upstream?.toString(),
            ws: r.ws,
            source: r.source,
            redirectTo: r.redirectTo,
            exact: r.exact,
          })),
        addRoute: (route) => proxy.addRoute(route),
      };
    }

    wireServices(context, config, log, proxyInstance);

    // Run lifecycle hooks after config resolves, before runtime construction.
    // Identity wraps when no hook is registered; otherwise composed contributions.
    bootTimings.lifecycleInitStartedAt = Date.now();
    const lifecycleCtx: LifecycleInitContext = {
      config,
      cliName: options.name,
      cliVersion: options.version,
      log,
      eventBus: getEventBus(),
      userStoreFolder: userStoreFolder(options.name),
      isInteractive: process.stdin.isTTY === true,
      bootTimings,
    };
    const lifecycle = await initLifecycle(
      options.lifecycle ?? [],
      lifecycleCtx,
    );

    // Resolve Resolvable values now that workdir/config are known.
    // Cast config to the inferred type — at runtime it IS that type (Zod parsed it).
    type TConfig = TMerged;
    const typedConfig = config as TConfig;
    const resolvableCtx = { workdir, config: typedConfig };
    const resolvedDescription = resolveValue(
      options.description,
      resolvableCtx,
    );
    const resolvedWelcome = options.interactive
      ? resolveValue(options.interactive.welcome, resolvableCtx)
      : undefined;

    // Create CLI runtime for lifecycle management (reactor, switchboard, agent, routine)
    const runtime = createCliRuntime({
      cliName: options.name,
      cliVersion: options.version,
      workdir,
      workspace,
      config,
      context,
      log,
      commandMap,
      reactorConfig,
      agentLoader,
      routine,
      skipRoutineStart: noRoutineFlag,
      proxyInstance,
      enableSwitchboard: !noApiFlag,
      enableConnect: !noStudioFlag,
      attachmentJwtHandler: options.attachmentJwtHandler?.({
        workdir,
        config: typedConfig,
      }),
      skillIds,
      resolvedSkills,
      prompts: options.prompts,
      wraps: lifecycle.wraps,
      lifecycleShutdown: lifecycle.shutdown,
    });

    // Wire lazy accessors onto the context
    if (reactorConfig) context.reactor = runtime.getReactor;
    context.agent = runtime.getAgent;

    // Handle --meta: output metadata JSON and exit (ignoring all other args)
    if (metaFlag) {
      stdout(JSON.stringify(getMetadata(), null, 2));
      exit(0);
      return;
    }

    // Collect non-flag, non-framework-value pre-command args as agent prompt words
    const promptArgs: string[] = [];
    {
      let skipNext = false;
      for (const arg of preCommandArgs) {
        if (skipNext) {
          skipNext = false;
          continue;
        }
        if (frameworkFlags.has(arg)) {
          skipNext = true;
          continue;
        }
        if (arg.startsWith("-")) continue;
        promptArgs.push(arg);
      }
    }
    const hasPrompt = !isSubcommand && agentLoader && promptArgs.length > 0;

    /**
     * Render an agent prompt from a SkillInvocation using its template.
     */
    function renderSkillPrompt(invocation: SkillInvocation): string {
      const template =
        invocation.instructionTemplate ?? DEFAULT_SKILL_INSTRUCTION;
      const skill = resolvedSkills.find((s) => s.name === invocation.skillName);
      const ctx: Record<string, unknown> = {
        skillId: invocation.skillName,
        description: skill?.description ?? "",
        prompt: invocation.userMessage ?? "",
        ...(invocation.inputValues ?? {}),
      };
      return renderSkillTemplate(template, ctx).rendered.trim();
    }

    // Skill invocation handler for command mode — routes to agent with skill prefix
    async function handleSkillInvocation(invocation: SkillInvocation) {
      const agentProvider = await runtime.getAgent();
      if (!agentProvider) {
        stderr("Agent not available — cannot invoke skill");
        exit(1);
        return;
      }
      const prompt = renderSkillPrompt(invocation);
      const threadId = resumeId ?? randomUUID();
      for await (const chunk of agentProvider.stream(prompt, {
        threadId,
        tools: commandMap,
      })) {
        writeRaw(formatStreamChunk(chunk));
      }
      stdout("");
      stdout(
        `\x1b[2mThread: ${threadId}  (continue with: ${options.name} --resume ${threadId} "your message")\x1b[0m`,
      );
    }

    // ── Dispatch ─────────────────────────────────────────────────────
    // --no-routine / --no-api suppress their respective keep-alive reasons
    const effectiveRoutine = noRoutineFlag ? undefined : routine;
    const effectiveApi = !noApiFlag && reactorConfig?.switchboard?.enabled;

    // Interaction mode: how the CLI does I/O
    // - headless: no input loop, execute and exit (or serve until killed)
    // - interactive-streaming: line-based stdio, EOF-aware, testable programmatically
    // - interactive-terminal: Ink REPL with rich UI
    const isTTY =
      interactiveFlag && !opts.interactiveInput && process.stdin.isTTY;
    type InteractionMode =
      | "headless"
      | "interactive-streaming"
      | "interactive-terminal";
    const mode: InteractionMode = !interactiveFlag
      ? "headless"
      : isTTY
        ? "interactive-terminal"
        : "interactive-streaming";

    // Keep-alive: why the process stays running after primary work completes
    // Orthogonal to interaction mode — a headless CLI with switchboard blocks on signals
    const hasKeepAlive =
      !!effectiveRoutine || !!effectiveApi || !!proxyInstance;

    if (isBuiltinFlag || (!interactiveFlag && (isSubcommand || hasPrompt))) {
      // ── Command execution (any mode): subcommand or prompt without -i → execute, exit ──
      if (hasPrompt) {
        const agentProvider = await runtime.getAgent();
        if (agentProvider) {
          const prompt = promptArgs.join(" ");
          const threadId = resumeId ?? randomUUID();
          for await (const chunk of agentProvider.stream(prompt, {
            threadId,
            tools: commandMap,
          })) {
            writeRaw(formatStreamChunk(chunk));
          }
          stdout("");
          stdout(
            `\x1b[2mThread: ${threadId}  (continue with: ${options.name} --resume ${threadId} "your message")\x1b[0m`,
          );
          await runtime.teardown();
          return;
        }
      }

      const program = buildProgram(
        stdout,
        context,
        resolvedDescription,
        agentLoader ? handleSkillInvocation : undefined,
        lifecycle.wraps,
      );
      try {
        await program.parseAsync(argv);
      } catch (err: any) {
        if (err.exitCode === 0) {
          exit(0);
          return;
        }
        const msg = err instanceof Error ? err.message : String(err);
        if (msg !== "(outputHelp)" && msg !== "(version)") stderr(msg);
        exit(err.exitCode ?? 1);
        return;
      }

      await runtime.teardown();
    } else if (interactiveFlag || hasKeepAlive) {
      // ── Interactive or keep-alive: -i OR hasKeepAlive ──────────────

      // 1. PREAMBLE — validate interactive config, build session if needed
      let session: import("../interactive/types.js").ReplSession | undefined;
      if (interactiveFlag) {
        if (!options.interactive) {
          stderr("Interactive mode is not configured for this CLI");
          exit(1);
          return;
        }

        const resolvedInteractive: ResolvedInteractiveConfig = {
          welcome: resolvedWelcome!,
          outputWindow: options.interactive?.outputWindow ?? 6,
        };
        const cliRef: Cli = {
          name: options.name,
          version: options.version,
          description: resolvedDescription,
          configSchema: options.configSchema,
          interactive: resolvedInteractive,
          get hasAgent() {
            return !!agentLoader;
          },
          get hasReactor() {
            return !!reactorConfig;
          },
          configureAgent,
          configureReactor,
          getCommand,
          listCommands,
          execute,
          parseArgs,
          generateHelp,
          generateCommandHelp,
          generateCompletion,
          configEnvVars,
          getMetadata,
          bootstrap,
          run,
          stopRoutine,
        };

        const agentProvider = await runtime.getAgent();
        session = createReplSession({
          cli: cliRef,
          context,
          agentProvider,
          threadId: resumeId,
        });
      }

      // 2. WELCOME (non-TTY only — Ink renders its own welcome)
      if (session?.welcome && mode !== "interactive-terminal")
        stdout(session.welcome);

      // 3. STARTUP + MODE-SPECIFIC MAIN LOOP
      switch (mode) {
        case "interactive-terminal": {
          // ── Ink REPL ──
          /* istanbul ignore next -- Ink REPL requires a real terminal */
          const { startInkRepl } = await import("../interactive/start.js");
          /* istanbul ignore next */
          await startInkRepl(session!, {
            services: context.services,
            workdir: context.workdir,
            onStart: async (append) => {
              await runtime.startupSequence(append);
            },
          });
          /* istanbul ignore next */
          await runtime.teardown();
          /* istanbul ignore next */
          exit(0);
          break;
        }

        case "interactive-streaming": {
          // ── Line-based stdio interaction ──
          try {
            await runtime.startupSequence(stdout);
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            log.error(msg);
            exit(1);
            return;
          }

          // Interactive input source: injected (testing) or piped stdin
          const { createStdinLineReader } = await import("./stdin.js");
          const source = opts.interactiveInput ?? createStdinLineReader();
          let exitedViaCommand = false;
          for await (const line of source) {
            const result = await session!.processInput(line);
            if (result.type === "exit") {
              if (result.text) stdout(result.text);
              exitedViaCommand = true;
              break;
            }
            if (result.text) stdout(result.text);
          }

          // EOF without /exit — show exit message (active services, resume hint)
          if (!exitedViaCommand) {
            stdout(session!.exitMessage);
          }

          // EOF received — if keep-alive reason exists, block on signals
          if (hasKeepAlive) {
            stdout("Stdin closed — still serving. Press Ctrl+C to stop.");
            await new Promise<void>((resolve) => {
              const onSignal = async () => {
                const suppress = () => {};
                process.removeListener("SIGINT", onSignal);
                process.removeListener("SIGTERM", onSignal);
                process.on("SIGINT", suppress);
                process.on("SIGTERM", suppress);
                await runtime.teardown();
                process.removeListener("SIGINT", suppress);
                process.removeListener("SIGTERM", suppress);
                resolve();
              };
              process.on("SIGINT", onSignal);
              process.on("SIGTERM", onSignal);
            });
            return; // teardown already called in signal handler
          }

          await runtime.teardown();
          exit(0);
          break;
        }

        case "headless": {
          // ── Headless with keep-alive: startup sequence, then block on signals ──
          try {
            await runtime.startupSequence(stdout);
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            stderr(msg);
            exit(1);
            return;
          }

          stdout("Serving — press Ctrl+C to stop.");
          await new Promise<void>((resolve) => {
            const onSignal = async () => {
              // Suppress duplicate signals from parent (pnpm) during teardown
              const suppress = () => {};
              process.removeListener("SIGINT", onSignal);
              process.removeListener("SIGTERM", onSignal);
              process.on("SIGINT", suppress);
              process.on("SIGTERM", suppress);
              runtime.reportActiveServices(stdout);
              await runtime.teardown();
              process.removeListener("SIGINT", suppress);
              process.removeListener("SIGTERM", suppress);
              resolve();
            };
            process.on("SIGINT", onSignal);
            process.on("SIGTERM", onSignal);
          });
          return; // teardown already called in signal handler
        }
      }
    } else {
      // ── Nothing to do: no -i, no keep-alive, no subcommand/prompt → show help ──
      const program = buildProgram(
        stdout,
        context,
        resolvedDescription,
        agentLoader ? handleSkillInvocation : undefined,
        lifecycle.wraps,
      );
      program.outputHelp();
      await runtime.teardown();
    }
  }

  async function stopRoutine(): Promise<void> {
    if (routine) {
      await routine.stop();
    }
  }

  function fieldsToMap(
    fields: FieldInfo[],
  ): Record<string, import("./types.js").MetadataField> {
    const map: Record<string, import("./types.js").MetadataField> = {};
    for (const f of fields) {
      const entry: import("./types.js").MetadataField = {
        id: f.key,
        description: f.description,
        optional: f.isOptional,
        type: f.baseType,
        sensitive: f.sensitive,
      };
      if (f.hasDefault) entry.default = f.defaultValue;
      map[f.key] = entry;
    }
    return map;
  }

  function getMetadata(): CliMetadata {
    const desc = resolveValue(options.description, {
      workdir: activeWorkdir,
      config: {} as TMerged,
    });

    // Config metadata — flat map with env var names inlined
    let configMeta: CliMetadata["config"] = null;
    if (options.configSchema) {
      const fields = getSchemaFields(options.configSchema, sensitiveKeys);
      const envVarsByField = new Map<string, string>();
      for (const ev of configEnvVars()) {
        envVarsByField.set(ev.field, ev.name);
      }
      configMeta = {};
      for (const f of fields) {
        const entry: import("./types.js").ConfigMetadataField = {
          id: f.key,
          description: f.description,
          optional: f.isOptional,
          type: f.baseType,
          sensitive: f.sensitive,
          env: envVarsByField.get(f.key) ?? "",
        };
        if (f.hasDefault) entry.default = f.defaultValue;
        configMeta[f.key] = entry;
      }
    }

    // Commands metadata (keyed by id) — exclude skill-wrapper commands (listed in skills.resolved)
    const commandsMeta: CliMetadata["commands"] = {};
    for (const cmd of commandMap.values()) {
      if (skillIds.has(cmd.id)) continue; // skip skill-wrapper commands
      commandsMeta[cmd.id] = {
        id: cmd.id,
        description: cmd.description,
        params: fieldsToMap(getSchemaFields(cmd.inputSchema)),
      };
    }

    // Services metadata (keyed by id)
    let servicesMeta: CliMetadata["services"] = null;
    if (options.services && options.services.length > 0) {
      servicesMeta = {};
      for (const svc of options.services) {
        // Collect MCP capture names from readiness patterns
        const mcpCaptures: string[] = [];
        if (svc.readiness) {
          if (svc.readiness.patterns) {
            for (const pat of svc.readiness.patterns) {
              if (pat.captures) {
                for (const [capName, def] of Object.entries(pat.captures)) {
                  if (typeof def === "object" && def.type === "api-mcp") {
                    mcpCaptures.push(capName);
                  }
                }
              }
            }
          } else if (svc.readiness.captures) {
            for (const [capName, def] of Object.entries(
              svc.readiness.captures,
            )) {
              if (typeof def === "object" && def.type === "api-mcp") {
                mcpCaptures.push(capName);
              }
            }
          }
        }

        // Build mcpPrefix: undefined | string | Record<string, string>
        let mcpPrefix: string | Record<string, string> | undefined;
        if (mcpCaptures.length === 1) {
          mcpPrefix = `${svc.id}-mcp__`;
        } else if (mcpCaptures.length > 1) {
          mcpPrefix = {};
          for (const capName of mcpCaptures) {
            mcpPrefix[capName] = `${svc.id}-${capName}-mcp__`;
          }
        }

        servicesMeta[svc.id] = {
          id: svc.id,
          name: resolveServiceName(svc),
          ...(svc.description && { description: svc.description }),
          ...(svc.maxInstances !== undefined && {
            maxInstances: svc.maxInstances,
          }),
          params: svc.paramsSchema
            ? fieldsToMap(getSchemaFields(svc.paramsSchema))
            : {},
          ...(svc.shutdown && {
            shutdown: {
              signal: String(svc.shutdown.signal),
              timeout: svc.shutdown.timeout,
            },
          }),
          ...(svc.restart && {
            restart: {
              enabled: svc.restart.enabled,
              maxRetries: svc.restart.maxRetries,
              delay: svc.restart.delay,
            },
          }),
          ...(svc.readiness?.timeout !== undefined && {
            readinessTimeout: svc.readiness.timeout,
          }),
          ...(mcpPrefix !== undefined && { mcpPrefix }),
        };
      }
    }

    // Prompts metadata
    let promptsMeta: CliMetadata["prompts"] = null;
    if (options.prompts) {
      const resolvedMap: Record<string, { id: string; description: string }> =
        {};
      for (const s of resolvedSkills) {
        resolvedMap[s.name] = { id: s.name, description: s.description };
      }
      promptsMeta = {
        artifacts: options.prompts.artifacts,
        agents: options.prompts.agents ?? {},
        skills: options.prompts.skills ?? {},
        resolved: resolvedMap,
      };
    }

    return {
      name: options.name,
      version: options.version,
      description: desc,
      hasInteractive: !!options.interactive,
      hasAgent: !!agentLoader,
      hasReactor: !!reactorConfig,
      config: configMeta,
      commands: commandsMeta,
      services: servicesMeta,
      prompts: promptsMeta,
    };
  }

  // Resolve description for the static Cli object (best-effort without runtime context)
  const staticDescription =
    typeof options.description === "string"
      ? options.description
      : options.description({ workdir: activeWorkdir, config: {} as TMerged });

  /**
   * Resolve the -app companion package directory using Node module resolution.
   * Falls back to the sibling directory convention for workspace layouts.
   */
  function resolveAppPackageDir(cliRoot: string, cliName: string): string {
    // Try Node module resolution first (works for npm global, pnpm global, etc.).
    // Any failure — missing/unreadable package.json, unresolvable module, no
    // matching package.json walking up — falls through to the sibling fallback.
    try {
      const cliPkgPath = path.join(cliRoot, "package.json");
      const cliPkg = JSON.parse(fs.readFileSync(cliPkgPath, "utf8"));
      const fullName = cliPkg.name as string; // e.g. "@powerhousedao/ph-clint-cli"
      const appPkgName = fullName.replace(/-cli$/, "-app"); // e.g. "@powerhousedao/ph-clint-app"

      const req = createRequire(cliPkgPath);
      const entry = req.resolve(appPkgName);
      // Walk up from the resolved entry to find the package root
      let dir = path.dirname(entry);
      while (dir !== path.dirname(dir)) {
        const candidate = path.join(dir, "package.json");
        if (fs.existsSync(candidate)) {
          const pkg = JSON.parse(fs.readFileSync(candidate, "utf8"));
          if (pkg.name === appPkgName) return dir;
        }
        dir = path.dirname(dir);
      }
    } catch {
      // Fall through to sibling convention
    }
    // Fall back to sibling directory (workspace layout)
    const bareName = cliName.replace(/^@[^/]+\//, "");
    return path.resolve(cliRoot, `../${bareName}-app`);
  }

  cliRef = {
    name: options.name,
    version: options.version,
    description: staticDescription,
    configSchema: options.configSchema,
    interactive: options.interactive,
    get hasAgent() {
      return !!agentLoader;
    },
    get hasReactor() {
      return !!reactorConfig;
    },
    configureAgent,
    configureReactor,
    getCommand,
    listCommands,
    execute,
    parseArgs,
    generateHelp,
    generateCommandHelp,
    generateCompletion,
    configEnvVars,
    getMetadata,
    bootstrap,
    run,
    stopRoutine,
  };

  return cliRef;
}
