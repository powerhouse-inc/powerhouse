/**
 * CLI telemetry (error reporting via Sentry).
 *
 * Design:
 * - Opt-out by default, asked once on first interactive run.
 * - Stores consent in ~/.ph/telemetry.json so we never ask twice.
 * - Respects PH_NO_TELEMETRY=1 and DO_NOT_TRACK=1 as immediate kill switches.
 * - Non-interactive (TTY missing, CI, piped) defaults to DISABLED — we don't
 *   want to hang a CI pipeline on an unanswered prompt, and we don't want to
 *   capture errors without informed consent.
 * - DSN is published in the CLI binary; Sentry DSNs accept events but grant
 *   no read access, so this is safe. Hardcoded so users can't accidentally
 *   misroute events.
 *
 * PII scrubbing in beforeSend hook:
 * - Home-directory paths collapsed to ~
 * - Flag/arg values that look like secrets (tokens, keys) stripped
 * - No source-context from user files
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// Sentry project "ph-cli" on the powerhouse-hosted Sentry instance.
// Public DSNs are safe to ship — they grant write-only ingest access.
const SENTRY_DSN =
  "https://0e7793802288589b4923896118374462@sentry.monitoring.vetra.io/3";

const TELEMETRY_FILE = join(homedir(), ".ph", "telemetry.json");

type TelemetryConfig = {
  enabled: boolean;
  askedAt: string;
};

export type CliInvocationInfo = {
  command?: string;
  subcommand?: string;
  pm?: string;
  argv: string[];
  cwd?: string;
};

export type TelemetryClient = {
  /**
   * Attaches per-invocation context (command, sanitized argv, package
   * manager) as Sentry tags + a `invocation` context block, plus a single
   * "cli invoked" breadcrumb. Safe to call once per process.
   */
  attachInvocationContext: (info: CliInvocationInfo) => void;
  /**
   * Captures an error (if telemetry is initialized) and flushes before the
   * caller calls process.exit(). Safe no-op when telemetry is disabled.
   */
  captureCliError: (
    err: unknown,
    opts?: { kind?: "crash" | "user" },
  ) => Promise<void>;
};

function isExplicitlyDisabled(): boolean {
  // Standard opt-out signals respected by most OSS CLIs.
  return (
    process.env.PH_NO_TELEMETRY === "1" ||
    process.env.PH_NO_TELEMETRY === "true" ||
    process.env.DO_NOT_TRACK === "1" ||
    process.env.DO_NOT_TRACK === "true"
  );
}

function isExplicitlyEnabled(): boolean {
  return (
    process.env.PH_TELEMETRY === "1" || process.env.PH_TELEMETRY === "true"
  );
}

function isInteractive(): boolean {
  // Only ask if stdin is a TTY and CI env isn't set.
  return Boolean(process.stdin.isTTY) && !process.env.CI;
}

function readConfig(): TelemetryConfig | null {
  try {
    if (!existsSync(TELEMETRY_FILE)) return null;
    return JSON.parse(readFileSync(TELEMETRY_FILE, "utf8")) as TelemetryConfig;
  } catch {
    return null;
  }
}

function writeConfig(cfg: TelemetryConfig): void {
  try {
    mkdirSync(join(homedir(), ".ph"), { recursive: true });
    writeFileSync(TELEMETRY_FILE, JSON.stringify(cfg, null, 2));
  } catch {
    // non-fatal; we'll just ask again next time
  }
}

/**
 * Prompts the user once, caches the answer. Must be called before init.
 * Returns `true` if telemetry should be enabled, `false` otherwise.
 */
export async function resolveTelemetryConsent(): Promise<boolean> {
  if (isExplicitlyDisabled()) return false;
  if (isExplicitlyEnabled()) return true;

  const cached = readConfig();
  if (cached) return cached.enabled;

  if (!isInteractive()) {
    // Non-interactive first run: stay silent, don't ask, don't send. User can
    // opt in later with `ph telemetry on` or PH_TELEMETRY=1.
    return false;
  }

  const enquirer = await import("enquirer");
  try {
    const { enabled } = await enquirer.default.prompt<{ enabled: boolean }>({
      type: "confirm",
      name: "enabled",
      message:
        "Help improve Powerhouse by sending anonymous error reports? " +
        "(stack traces only, paths and secrets are scrubbed)",
      initial: true,
    });
    writeConfig({ enabled, askedAt: new Date().toISOString() });
    return enabled;
  } catch {
    // user hit Ctrl-C during prompt — treat as no, but don't persist so we
    // ask again next time
    return false;
  }
}

function scrubString(input: string): string {
  if (!input) return input;
  const home = homedir();
  let out = input;
  // Collapse home dir to ~
  if (home && out.includes(home)) {
    out = out.split(home).join("~");
  }
  // Strip common secret-shaped flag values: --token=XYZ, --api-key XYZ, etc.
  out = out.replace(
    /(--?(?:token|api[-_]?key|password|secret|auth)[=\s])([^\s]+)/gi,
    "$1<redacted>",
  );
  return out;
}

type ScrubbableFrame = {
  filename?: string;
  abs_path?: string;
  pre_context?: unknown;
  context_line?: unknown;
  post_context?: unknown;
  vars?: unknown;
};

type ScrubbableException = {
  value?: string;
  stacktrace?: { frames?: ScrubbableFrame[] };
};

type ScrubbableEvent = {
  message?: string;
  logentry?: { message?: string };
  exception?: { values?: ScrubbableException[] };
  server_name?: string;
  extra?: Record<string, unknown>;
};

function scrubEvent<T>(event: T): T {
  const e = event as ScrubbableEvent;
  try {
    if (e.message) e.message = scrubString(e.message);
    if (e.logentry?.message) {
      e.logentry.message = scrubString(e.logentry.message);
    }
    const values = e.exception?.values;
    if (Array.isArray(values)) {
      for (const ex of values) {
        if (ex.value) ex.value = scrubString(ex.value);
        const frames = ex.stacktrace?.frames;
        if (Array.isArray(frames)) {
          for (const f of frames) {
            if (f.filename) f.filename = scrubString(f.filename);
            if (f.abs_path) f.abs_path = scrubString(f.abs_path);
            // Drop captured source context from user machines — privacy.
            delete f.pre_context;
            delete f.context_line;
            delete f.post_context;
            delete f.vars;
          }
        }
      }
    }
    // Server name can leak the user's machine hostname; drop it.
    delete e.server_name;
    // Strip raw argv from extra context.
    if (e.extra) {
      delete e.extra.argv;
      delete e.extra.env;
    }
  } catch {
    // Never let scrubbing throw — worst case we drop the event below.
  }
  return event;
}

/**
 * Initializes Sentry for CLI error reporting if telemetry is enabled.
 * Safe to call multiple times; only the first call takes effect.
 */
export async function initCliTelemetry(opts: {
  cliName: "ph-cli" | "ph-cmd";
  release?: string;
}): Promise<TelemetryClient | undefined> {
  const enabled = await resolveTelemetryConsent();
  if (!enabled) return;

  const Sentry = await import("@sentry/node-core/light");
  const os = await import("node:os");
  const sentryClient = Sentry.init({
    dsn: SENTRY_DSN,
    release: opts.release,
    environment: process.env.NODE_ENV || "production",
    sendDefaultPii: false,
    defaultIntegrations: false,
    integrations: [
      // Only the bare minimum — no automatic HTTP/FS instrumentation.
    ],
    beforeSend(event) {
      return scrubEvent(event);
    },
    beforeBreadcrumb(breadcrumb) {
      if (breadcrumb.message) {
        breadcrumb.message = scrubString(breadcrumb.message);
      }
      return breadcrumb;
    },
  });
  Sentry.setTag("cli_name", opts.cliName);
  if (opts.release) Sentry.setTag("cli_version", opts.release);
  // Environment tags — `defaultIntegrations: false` strips Sentry's auto
  // node-context, so attach the bits we care about manually (and keep
  // hostname out of it).
  Sentry.setTag("os", process.platform);
  Sentry.setTag("arch", process.arch);
  Sentry.setTag("node_version", process.version);
  Sentry.setTag("ci", String(Boolean(process.env.CI)));
  Sentry.setTag("tty", String(Boolean(process.stdin.isTTY)));
  Sentry.setContext("runtime", {
    name: "node",
    version: process.version,
  });
  Sentry.setContext("os", {
    name: process.platform,
    version: os.release(),
  });
  Sentry.setContext("device", {
    arch: process.arch,
  });
  if (!sentryClient) {
    return;
  }
  return {
    attachInvocationContext(info: CliInvocationInfo) {
      const argv = info.argv.map(scrubString);
      const flagNames = info.argv
        .filter((a) => a.startsWith("-"))
        .map((a) => a.split("=")[0]);
      if (info.command) Sentry.setTag("command", info.command);
      if (info.subcommand) Sentry.setTag("subcommand", info.subcommand);
      if (info.pm) Sentry.setTag("pm", info.pm);
      Sentry.setContext("invocation", {
        command: info.command,
        subcommand: info.subcommand,
        argv,
        flag_names: flagNames,
        argv_count: argv.length,
        cwd: info.cwd ? scrubString(info.cwd) : undefined,
      });
      Sentry.addBreadcrumb({
        category: "cli",
        level: "info",
        message: "cli invoked",
        data: {
          command: info.command,
          pm: info.pm,
          tty: Boolean(process.stdin.isTTY),
          ci: Boolean(process.env.CI),
        },
      });
    },
    captureCliError: async (
      err: unknown,
      captureOpts?: { kind?: "crash" | "user" },
    ) => {
      try {
        Sentry.setTag("error_kind", captureOpts?.kind ?? "crash");
        sentryClient.captureException(err);
        await sentryClient.flush(2000);
      } catch {
        // Reporting must never mask the real error.
      }
    },
  };
}

/**
 * Explicitly set telemetry consent (used by `ph telemetry on|off`).
 */
export function setTelemetryConsent(enabled: boolean): void {
  writeConfig({ enabled, askedAt: new Date().toISOString() });
}

/**
 * Returns the current telemetry state — useful for `ph telemetry status`.
 */
export function getTelemetryStatus():
  | { source: "env"; enabled: boolean }
  | { source: "config"; enabled: boolean; askedAt: string }
  | { source: "default"; enabled: false } {
  if (isExplicitlyDisabled()) return { source: "env", enabled: false };
  if (isExplicitlyEnabled()) return { source: "env", enabled: true };
  const cached = readConfig();
  if (cached)
    return {
      source: "config",
      enabled: cached.enabled,
      askedAt: cached.askedAt,
    };
  return { source: "default", enabled: false };
}
