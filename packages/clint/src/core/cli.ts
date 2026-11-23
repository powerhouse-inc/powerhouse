import fs from "node:fs";
import { Command as Commander } from "commander";
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
} from "./types.js";
import type {
  ReactorConfiguration,
  DocumentRegistry,
  AnyRegistry,
} from "../integrations/powerhouse/types.js";
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
import {
  connectRemoteServices,
  refuseServiceStarts,
  serveServices,
} from "./service-control.js";
import {
  callControl,
  ControlError,
  processControlChannel,
  protocolMismatch,
} from "@powerhousedao/host-core/control-channel";
import {
  COMMAND_METHOD,
  CommandTooLarge,
  describeCaller,
  readPipedStdin,
  sendCommand,
  serveCommands,
  untilAborted,
  type ForwardedCommand,
} from "./command-control.js";
import {
  instanceDataDir,
  instanceServicesDir,
} from "@powerhousedao/host-core/instance";
import { reportLegacyServiceState } from "./legacy-services.js";
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
import { loadTemplates, renderSkillTemplate } from "./templates.js";
import { createRoutine } from "./routine.js";
import { createEventBus } from "./events.js";
import { createProcessManager } from "./processes.js";
import { createServiceManager } from "./services.js";
import { createMemberServiceManager } from "./member-services.js";
import {
  createRoutineServiceAdapter,
  createCompositeServiceManager,
} from "./routine-service.js";
import { createReplSession } from "../interactive/session.js";
import { formatZodError } from "./errors.js";
import { createLogger } from "./logger.js";
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
  writeRawErr: (text: string) => void;
  configFile?: string;
  resume?: string;
  interactiveInput?: AsyncIterable<string>;
  logLevel?: import("./types.js").LogLevel;
  reactor?: RunOptions["reactor"];
  onServe?: RunOptions["onServe"];
  signal?: RunOptions["signal"];
  members?: RunOptions["members"];
  remoteServices?: RunOptions["remoteServices"];
  serveCommand?: RunOptions["serveCommand"];
  forward?: RunOptions["forward"];
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
  // services were added after defineCli().
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
    // Erase R at the storage site — at runtime the registry is just a dict.
    // The generic only exists to type-check the caller's `create` factory.
    reactorConfig = config as unknown as ReactorConfiguration;
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
      readStdin: readPipedStdin,
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
    /** Runs the command elsewhere; resolves false when it is to run here. */
    elsewhere?: (
      cmd: Command,
      input: Record<string, unknown>,
    ) => Promise<boolean>,
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

    program.option("--verbose", "Enable debug-level logging");
    program.option("--meta", "Output CLI metadata as JSON");
    program.option(
      "--local",
      "Run the command in this process, not in a running instance",
    );

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
        if (elsewhere && (await elsewhere(cmd, merged))) return;
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
   * Wire up ServiceManager (process + routine + compound members) and event
   * handlers onto a freshly-built context.  Shared by bootstrap() and the
   * interactive-mode startup in runImpl().
   */
  function wireServices(
    context: CommandContext,
    config: Record<string, unknown>,
    log: import("./types.js").Logger,
    members?: RunOptions["members"],
  ): void {
    const servicesNow = options.services && options.services.length > 0;
    let processServiceManager: import("./types.js").ServiceManager | undefined;
    if (servicesNow && options.services) {
      // Under the data folder: an instance is a host plus a data folder, so
      // two project folders keep, and list, their own services.
      const svcDir = instanceServicesDir(
        { dataDir: instanceDataDir(context.workdir) },
        options.name,
      );
      reportLegacyServiceState({
        legacyDir: userStoreFolder(options.name, "services"),
        servicesDir: svcDir,
        workdir: context.workdir,
        warn: (message) => log.warn(message),
      });
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

    // The compound's members, beside the CLI's own services. A member named
    // like one of those is left out: the CLI's service keeps its name.
    if (members) {
      const memberManager = createMemberServiceManager(members);
      const own = context.services;
      const routeMap = new Map<string, import("./types.js").ServiceManager>();
      if (own) {
        for (const svc of options.services ?? []) routeMap.set(svc.id, own);
        if (routineServiceAdapter) {
          routeMap.set(options.routine!.id!, own);
        }
      }
      for (const member of members()) {
        if (!routeMap.has(member.name)) {
          routeMap.set(member.name, memberManager);
        }
      }
      context.services = createCompositeServiceManager(
        own ? [own, memberManager] : [memberManager],
        routeMap,
      );
    }

    if (_eventBus && options.events) {
      for (const [event, handler] of Object.entries(options.events)) {
        _eventBus.on(event, (data: unknown) => handler(data, log));
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
      writeRawErr: runOptions?.stderr
        ? (text: string) => runOptions.stderr!(text.replace(/\n$/, ""))
        : (text: string) => {
            process.stderr.write(text);
          },
      configFile: runOptions?.configFile,
      resume: runOptions?.resume,
      interactiveInput: runOptions?.interactiveInput,
      logLevel: runOptions?.logLevel,
      reactor: runOptions?.reactor,
      onServe: runOptions?.onServe,
      signal: runOptions?.signal,
      members: runOptions?.members,
      remoteServices: runOptions?.remoteServices,
      serveCommand: runOptions?.serveCommand,
      forward: runOptions?.forward,
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
    let localFlag = false;
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
      } else if (arg === "--local") {
        localFlag = true;
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

    const postCmdArgs = userArgs.slice(subcommandIdx);
    const firstSubcmd = postCmdArgs[0];
    const isSubcommand =
      firstSubcmd && (commandMap.has(firstSubcmd) || firstSubcmd === "help");
    // --help/--version are Commander built-ins.
    const isBuiltinFlag = preCommandArgs.some(
      (a) => a === "--help" || a === "-h" || a === "--version" || a === "-V",
    );

    wireServices(context, config, log, opts.members);

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

    // The run's reactor: a host runner's (RunOptions.reactor) stands in for
    // the configured one.
    const supplyReactor = opts.reactor;
    const runReactor: ReactorConfiguration | undefined = supplyReactor
      ? { create: (setup) => supplyReactor(setup, reactorConfig) }
      : reactorConfig;

    // Create CLI runtime for lifecycle management (reactor, agent, routine)
    const runtime = createCliRuntime({
      cliName: options.name,
      cliVersion: options.version,
      workdir,
      workspace,
      config,
      context,
      log,
      commandMap,
      reactorConfig: runReactor,
      agentLoader,
      routine,
      skipRoutineStart: noRoutineFlag,
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
    if (runReactor) context.reactor = runtime.getReactor;
    if (supplyReactor) context.reactorAttached = true;
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

    /**
     * One turn of the agent, its answer written as it streams. Resolves false
     * when the CLI has no agent.
     */
    async function streamPrompt(
      prompt: string,
      to: {
        raw: (text: string) => void;
        line: (message: string) => void;
        resume?: string;
        signal?: AbortSignal;
      } = { raw: writeRaw, line: stdout, resume: resumeId },
    ): Promise<boolean> {
      const agentProvider = await runtime.getAgent();
      if (!agentProvider) return false;
      const threadId = to.resume ?? randomUUID();
      for await (const chunk of agentProvider.stream(prompt, {
        threadId,
        tools: commandMap,
        ...(to.signal ? { abortSignal: to.signal } : {}),
      })) {
        to.raw(formatStreamChunk(chunk));
      }
      to.line("");
      to.line(
        `\x1b[2mThread: ${threadId}  (continue with: ${options.name} --resume ${threadId} "your message")\x1b[0m`,
      );
      return true;
    }

    // Skill invocation handler for command mode — routes to agent with skill prefix
    async function handleSkillInvocation(invocation: SkillInvocation) {
      if (!(await runtime.getAgent())) {
        stderr("Agent not available — cannot invoke skill");
        exit(1);
        return;
      }
      await loadTemplates();
      await streamPrompt(renderSkillPrompt(invocation));
    }

    /** What `cmd` needs of a running instance. */
    const needsOf = (cmd: Command) =>
      cmd.needs ?? (skillIds.has(cmd.id) ? "agent" : "nothing");
    const readsStdin = (cmd: Command, input: Record<string, unknown>) =>
      typeof cmd.stdin === "function" ? cmd.stdin(input) : cmd.stdin === true;

    /**
     * A command the running instance executes for a caller in another
     * process: with this instance's reactor and agent, its output to the
     * caller. Resolves with the exit code; rejects only when it was cancelled.
     */
    async function runForwarded(run: ForwardedCommand): Promise<number> {
      const { request, caller } = run;
      const line = (message: string) => run.stdout(`${message}\n`);
      const fail = (message: string) => run.stderr(`${message}\n`);
      const what = request.command ?? "a prompt";
      log.debug(
        `Running ${what} for ${caller.user || "an unnamed user"} (pid ${caller.pid}).`,
      );
      context.emit?.("command:forwarded", {
        command: request.command,
        user: caller.user,
        pid: caller.pid,
      });
      try {
        if (request.prompt !== undefined) {
          const answered = await untilAborted(
            streamPrompt(request.prompt, {
              raw: run.stdout,
              line,
              signal: run.signal,
              ...(request.resume ? { resume: request.resume } : {}),
            }),
            run.signal,
          );
          if (answered) return 0;
          fail(`${options.name} has no agent to answer a prompt.`);
          return 1;
        }
        const cmd = commandMap.get(request.command!);
        if (!cmd || cmd.id === "cli-docs") {
          fail(`Unknown command: ${request.command}`);
          return 1;
        }
        if (needsOf(cmd) === "nothing") {
          fail(
            `${cmd.id} runs in the process that calls it, not in the running ${options.name}.`,
          );
          return 1;
        }
        const input = request.input ?? {};
        let parsed;
        try {
          parsed = cmd.inputSchema.parse(input);
        } catch (err) {
          fail(formatZodError(err, cmd.id));
          return 1;
        }
        const ctx: CommandContext = {
          ...context,
          stdout: run.stdout,
          log: createLogger(request.verbose ? "debug" : logLevel, fail),
          signal: run.signal,
          caller,
          readStdin: readsStdin(cmd, input)
            ? () => Promise.resolve(request.stdin)
            : () =>
                Promise.reject(
                  new Error(
                    `${cmd.id} reads piped input but does not declare it (stdin), so the caller's was not sent. Pass the input as an option or a file.`,
                  ),
                ),
        };
        delete ctx._onToolOutput;
        ctx.runProcess = (command, runOpts) =>
          processManager.run(command, {
            ...runOpts,
            onOutput: (text) => ctx.stdout(text + "\n"),
          });
        const result = await untilAborted(
          lifecycle.wraps.command(cmd.id, () => cmd.execute(parsed, ctx)),
          run.signal,
        );
        if (isSkillInvocation(result)) {
          await loadTemplates();
          const answered = await untilAborted(
            streamPrompt(renderSkillPrompt(result), {
              raw: run.stdout,
              line,
              signal: run.signal,
              ...(request.resume ? { resume: request.resume } : {}),
            }),
            run.signal,
          );
          if (answered) return 0;
          fail("Agent not available — cannot invoke skill");
          return 1;
        }
        const output = formatResult(result);
        if (output !== undefined) line(output);
        return 0;
      } catch (err: any) {
        // Answered as cancelled by the channel.
        if (run.signal.aborted) throw err;
        fail(err instanceof Error ? err.message : String(err));
        return typeof err?.exitCode === "number" && err.exitCode !== 0
          ? err.exitCode
          : 1;
      }
    }

    /** Where a command that needs a running instance is refused without one. */
    const noInstance = (what: string) =>
      `${what} runs in a running ${options.name}, and none runs for ${workdir}. ` +
      `Start it with ${opts.serveCommand ? `\`${opts.serveCommand}\`` : "`ph run <host>`"}, then run this again.`;

    /**
     * Sends a command (or a prompt) that needs the reactor or the agent to
     * the running instance and shows its output. Resolves with the exit code,
     * or undefined when it is to run in this process.
     */
    async function inInstance(
      what:
        | { command: Command; input: Record<string, unknown> }
        | { prompt: string },
    ): Promise<number | undefined> {
      const forward = opts.forward;
      if (!forward || localFlag) return undefined;
      if ("command" in what && needsOf(what.command) === "nothing") {
        return undefined;
      }
      const name =
        "command" in what
          ? `${options.name} ${what.command.id}`
          : `A prompt to ${options.name}`;
      const { target } = forward;
      const control = target?.control;
      if (!control) {
        if (target?.protocol !== undefined) {
          stderr(
            `${name} was not sent to the running ${options.name}${target.pid ? ` (pid ${target.pid})` : ""}. ${protocolMismatch(target.protocol)}`,
          );
          return 1;
        }
        if (!forward.required) return undefined;
        stderr(noInstance(name));
        return 1;
      }
      // Whether it is there and takes commands, before anything is sent.
      try {
        const hello = (await callControl(control, "hello", undefined, {
          timeoutMs: 5_000,
        })) as { methods?: unknown } | null;
        const methods = Array.isArray(hello?.methods) ? hello.methods : [];
        if (!methods.includes(COMMAND_METHOD)) {
          if (!forward.required) return undefined;
          stderr(
            `${name} needs a running ${options.name}; the instance for ${workdir}${target.pid ? ` (pid ${target.pid})` : ""} takes no commands.`,
          );
          return 1;
        }
      } catch (err) {
        if (!(err instanceof ControlError)) throw err;
        if (err.code === "unreachable") {
          if (!forward.required) return undefined;
          stderr(noInstance(name));
        } else {
          stderr(err.message);
        }
        return 1;
      }
      const stdin =
        "command" in what && readsStdin(what.command, what.input)
          ? await readPipedStdin()
          : undefined;
      const stop = new AbortController();
      const abort = () => stop.abort();
      process.once("SIGINT", abort);
      process.once("SIGTERM", abort);
      opts.signal?.addEventListener("abort", abort, { once: true });
      if (opts.signal?.aborted) abort();
      try {
        return await sendCommand(
          control,
          {
            cli: options.name,
            version: options.version,
            ...("command" in what
              ? { command: what.command.id, input: what.input }
              : { prompt: what.prompt }),
            ...(resumeId ? { resume: resumeId } : {}),
            workdir,
            ...describeCaller(),
            ...(verboseFlag ? { verbose: true } : {}),
            ...(stdin === undefined ? {} : { stdin }),
          },
          { stdout: writeRaw, stderr: opts.writeRawErr, signal: stop.signal },
        );
      } catch (err) {
        if (err instanceof ControlError && err.code === "cancelled") return 130;
        if (!(err instanceof ControlError || err instanceof CommandTooLarge)) {
          throw err;
        }
        stderr(err.message);
        return 1;
      } finally {
        process.off("SIGINT", abort);
        process.off("SIGTERM", abort);
        opts.signal?.removeEventListener("abort", abort);
      }
    }

    // ── Dispatch ─────────────────────────────────────────────────────
    // --no-routine suppresses the keep-alive reason
    const effectiveRoutine = noRoutineFlag ? undefined : routine;

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
    // Orthogonal to interaction mode — a headless CLI with a routine blocks on signals
    const hasKeepAlive = !!effectiveRoutine;

    if (isBuiltinFlag || (!interactiveFlag && (isSubcommand || hasPrompt))) {
      // ── Command execution (any mode): subcommand or prompt without -i → execute, exit ──
      // A command ends: the services it names are a running instance's, or
      // none it may start (they would end with it).
      if (context.services && isSubcommand && !isBuiltinFlag) {
        const local = context.services;
        const remote = opts.remoteServices
          ? await connectRemoteServices(local, opts.remoteServices)
          : undefined;
        context.services =
          remote ?? refuseServiceStarts(local, opts.serveCommand);
      }
      if (opts.remoteServices && !isBuiltinFlag) {
        context.serving = opts.remoteServices;
      }
      // What a command needs of a running instance it gets there, when the
      // run says so; this process then starts no reactor and no agent.
      let exitCode: number | undefined;
      if (opts.forward?.required && !localFlag && !isBuiltinFlag) {
        const none = (what: string) => () =>
          Promise.reject(
            new Error(
              `This command asked for the ${what}, which the running ${options.name} holds: it must declare needs: "${what}" to run there.`,
            ),
          );
        if (!supplyReactor) context.reactor = none("reactor");
        context.agent = none("agent");
      }
      if (hasPrompt) {
        const prompt = promptArgs.join(" ");
        exitCode = await inInstance({ prompt });
        if (exitCode !== undefined) {
          await runtime.teardown();
          if (exitCode !== 0) exit(exitCode);
          return;
        }
        if (await streamPrompt(prompt)) {
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
        async (cmd, input) => {
          exitCode = await inInstance({ command: cmd, input });
          return exitCode !== undefined;
        },
      );
      try {
        await program.parseAsync(argv);
      } catch (err: any) {
        // A failed command still stops what it started.
        try {
          await runtime.teardown();
        } catch {
          // the command's own error is the one to report
        }
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
      if (exitCode) exit(exitCode);
    } else if (interactiveFlag || hasKeepAlive) {
      // ── Interactive or keep-alive: -i OR hasKeepAlive ──────────────

      // 0. The run keeps going: a host runner records it before it starts.
      if (opts.onServe) {
        try {
          const answer = await opts.onServe();
          if (answer) {
            await runtime.teardown();
            stdout(answer.running);
            exit(0);
            return;
          }
        } catch (err) {
          await runtime.teardown();
          stderr(err instanceof Error ? err.message : String(err));
          exit(1);
          return;
        }
      }
      // Commands typed beside this run reach its services on the process's
      // control channel, when the host runner opened one, and those that
      // need its reactor or agent run here.
      const control = processControlChannel();
      if (control) {
        const served = {
          name: options.name,
          version: options.version,
          workdir,
        };
        if (context.services) serveServices(control, context.services, served);
        serveCommands(control, served, runForwarded);
      }

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
            return !!runReactor;
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
            ...(opts.signal ? { signal: opts.signal } : {}),
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

          // EOF without /exit — show exit message (services stopping, resume hint)
          if (!exitedViaCommand) {
            stdout(session!.exitMessage);
          }

          // EOF received — if keep-alive reason exists, block on signals
          if (hasKeepAlive) {
            stdout("Stdin closed — still serving. Press Ctrl+C to stop.");
            await new Promise<void>((resolve) => {
              let stopped = false;
              const onSignal = async () => {
                if (stopped) return;
                stopped = true;
                opts.signal?.removeEventListener("abort", onSignal);
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
              // A stop from the process this CLI runs in (its compound).
              opts.signal?.addEventListener("abort", onSignal, { once: true });
              if (opts.signal?.aborted) void onSignal();
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
            let stopped = false;
            const onSignal = async () => {
              if (stopped) return;
              stopped = true;
              opts.signal?.removeEventListener("abort", onSignal);
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
            // A stop from the process this CLI runs in (its compound).
            opts.signal?.addEventListener("abort", onSignal, { once: true });
            if (opts.signal?.aborted) void onSignal();
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
              // A host service is asked to stop through its stdin.
              signal: svc.run ? "stdin" : String(svc.shutdown.signal),
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
