import { resolvePackageRoot } from "@powerhousedao/host-core";
import { CALLER_CWD_ENV } from "@powerhousedao/shared/clis/command-names";
import { yellow } from "colorette";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { resolveCommand, type Agent } from "package-manager-detector";
import { valid } from "semver";
import { getVersion } from "../get-version.js";

/**
 * `ph vetra` is the gateway to Vetra Studio, the host `studio` that the
 * package @powerhousedao/vetra-cli supplies. ph-cli names the package and the
 * host and nothing else of it: `ph vetra [verb] [args]` is
 * `ph run @powerhousedao/vetra-cli/studio [verb] [args]`, once the project
 * has the package. A project without it gets it first, as a devDependency at
 * this ph-cli's version: the two are released with the same version numbers.
 */
export const VETRA_STUDIO_PACKAGE = "@powerhousedao/vetra-cli";
export const VETRA_STUDIO_HOST = `${VETRA_STUDIO_PACKAGE}/studio`;

/** Set on the ph-cli started after an install: it finds the package, or
 * fails, and never installs it again. */
export const VETRA_GATEWAY_ENV = "PH_VETRA_GATEWAY_INSTALLED";

/** The package as the project has it; undefined when it has none. */
export type InstalledStudio = { version: string | undefined } | undefined;

export type VetraGatewayPlan =
  | { action: "run"; warning?: string }
  | { action: "install"; notice: string; command: string };

/** The command line that adds the package at ph-cli's version as a
 * devDependency, with the project's package manager. */
export function studioInstallCommand(
  agent: Agent,
  phCliVersion: string,
): string {
  // A build that does not know its version takes the latest release.
  const version = valid(phCliVersion) ?? "latest";
  // As `ph install --local`: on a release day the packages are younger than
  // pnpm 11's minimumReleaseAge.
  const releaseAge = agent.startsWith("pnpm")
    ? ["--config.minimum-release-age=0"]
    : [];
  const resolved = resolveCommand(agent, "add", [
    "-D",
    `${VETRA_STUDIO_PACKAGE}@${version}`,
    ...releaseAge,
  ]);
  if (!resolved) {
    throw new Error(
      `Could not resolve an install command for package manager "${agent}".`,
    );
  }
  return [resolved.command, ...resolved.args].join(" ");
}

/** What `ph vetra` does in a project: install the package, or run its host,
 * warning when the installed version is not ph-cli's. */
export function planVetraGateway(facts: {
  installed: InstalledStudio;
  phCliVersion: string;
  packageManager: Agent;
}): VetraGatewayPlan {
  const { installed, phCliVersion, packageManager } = facts;
  const command = studioInstallCommand(packageManager, phCliVersion);
  if (installed === undefined) {
    return {
      action: "install",
      notice:
        `Vetra Studio is the package ${VETRA_STUDIO_PACKAGE}, which this project does not have yet. ` +
        `Installing it as a devDependency with ${packageManager}:`,
      command,
    };
  }
  const { version } = installed;
  if (
    version !== undefined &&
    valid(phCliVersion) !== null &&
    version !== phCliVersion
  ) {
    return {
      action: "run",
      warning: `${VETRA_STUDIO_PACKAGE} ${version} is installed, but this ph-cli is ${phCliVersion}: align them with \`${command}\`.`,
    };
  }
  return { action: "run" };
}

export interface VetraGatewayDeps {
  /** The project root, undefined outside a project, and its package manager. */
  project: () => Promise<{ projectPath?: string; packageManager: Agent }>;
  phCliVersion: string;
  installedStudio: (projectRoot: string) => InstalledStudio;
  /** Runs an install command line in `cwd`; resolves to its exit code. */
  install: (command: string, cwd: string) => Promise<number | null>;
  /** Runs this ph-cli with `args` in a new process; resolves to its exit code. */
  reexec: (args: string[], cwd: string) => Promise<number>;
  env: NodeJS.ProcessEnv;
  log: (message: string) => void;
  warn: (message: string) => void;
}

export type VetraGatewayResult =
  /** Go on with this command line, in the project root. */
  | { args: string[]; projectRoot: string }
  /** A new ph-cli ran it, after the install. */
  | { exitCode: number };

/**
 * `ph vetra [verb] [args]` (`rest`) in the project: the `ph run` command line
 * of the studio host when the package is there. Otherwise it installs the
 * package and runs that command line in a new ph-cli, since a package
 * installed while this one runs is not reliably resolved by it (Node caches
 * lookups, and the install may relink what it imports later).
 */
export async function openVetraStudio(
  rest: readonly string[],
  deps: VetraGatewayDeps,
): Promise<VetraGatewayResult> {
  const { projectPath, packageManager } = await deps.project();
  if (projectPath === undefined) {
    throw new Error(
      "No Powerhouse project found, so `ph vetra` cannot open Vetra Studio: it installs into and runs in a project. " +
        "Run it in one, or create one with `ph init`.",
    );
  }
  const runArgs = ["run", VETRA_STUDIO_HOST, ...rest];
  const plan = planVetraGateway({
    installed: deps.installedStudio(projectPath),
    phCliVersion: deps.phCliVersion,
    packageManager,
  });
  if (plan.action === "run") {
    if (plan.warning) deps.warn(plan.warning);
    return { args: runArgs, projectRoot: projectPath };
  }
  // A stop reads the run record only: there is nothing to install for it.
  if (rest.includes("--stop"))
    return { args: runArgs, projectRoot: projectPath };
  const manual = `Install it yourself, then run \`ph vetra\` again:\n  ${plan.command}`;
  if (deps.env[VETRA_GATEWAY_ENV]) {
    throw new Error(
      `${VETRA_STUDIO_PACKAGE} was installed, but this ph-cli does not find it from ${projectPath}. ${manual}`,
    );
  }
  deps.log(plan.notice);
  deps.log(`> ${plan.command}`);
  const code = await deps.install(plan.command, projectPath);
  if (code !== 0) {
    const how = code === null ? "could not run" : `exited with code ${code}`;
    throw new Error(
      `The install of ${VETRA_STUDIO_PACKAGE} ${how}, so Vetra Studio cannot start. ${manual}`,
    );
  }
  if (deps.installedStudio(projectPath) === undefined) {
    throw new Error(
      `The install passed, but ${VETRA_STUDIO_PACKAGE} does not resolve from ${projectPath}. ${manual}`,
    );
  }
  return { exitCode: await deps.reexec(runArgs, projectPath) };
}

/** The package's version as `ph run <package>/<host>` finds it: from the
 * project root, by its package.json, without importing it. */
export function installedStudio(projectRoot: string): InstalledStudio {
  const root = resolvePackageRoot(projectRoot, VETRA_STUDIO_PACKAGE);
  if (root === undefined) return undefined;
  try {
    const { version } = JSON.parse(
      readFileSync(path.join(root, "package.json"), "utf8"),
    ) as { version?: unknown };
    return { version: typeof version === "string" ? version : undefined };
  } catch {
    return { version: undefined };
  }
}

function runInstall(command: string, cwd: string): Promise<number | null> {
  return new Promise((resolve) => {
    // One command line, as printed: a shell runs the package manager's shim.
    const child = spawn(command, {
      cwd,
      stdio: "inherit",
      shell: true,
      windowsHide: true,
    });
    child.once("error", () => resolve(null));
    child.once("close", (code) => resolve(code));
  });
}

function reexecPhCli(args: string[], cwd: string): Promise<number> {
  const child = spawn(process.execPath, [process.argv[1], ...args], {
    cwd,
    stdio: "inherit",
    env: { ...process.env, [VETRA_GATEWAY_ENV]: "1" },
    windowsHide: true,
  });
  // Ctrl-C reaches the child from the terminal as well: wait while it stops.
  const ignore = () => {};
  const forward = (signal: NodeJS.Signals) => child.kill(signal);
  process.on("SIGINT", ignore);
  process.on("SIGTERM", forward);
  return new Promise<number>((resolve) => {
    const done = (code: number) => {
      process.off("SIGINT", ignore);
      process.off("SIGTERM", forward);
      resolve(code);
    };
    child.once("error", () => done(1));
    child.once("exit", (code) => done(code ?? 1));
  });
}

/** cli.ts's `ph vetra`: the command line to go on with, in the project root,
 * or the exit code of the ph-cli that ran it. */
export async function vetraGateway(
  rest: readonly string[],
): Promise<{ args: string[] } | { exitCode: number }> {
  const result = await openVetraStudio(rest, {
    project: async () => {
      const { getPowerhouseProjectInfo } =
        await import("@powerhousedao/shared/clis");
      return getPowerhouseProjectInfo(undefined, { silent: true });
    },
    phCliVersion: getVersion(),
    installedStudio,
    install: runInstall,
    reexec: reexecPhCli,
    env: process.env,
    log: (message) => console.log(message),
    warn: (message) => console.warn(yellow(message)),
  });
  if ("args" in result && path.resolve(result.projectRoot) !== process.cwd()) {
    // As ph-cmd runs ph-cli: in the project root, with relative paths still
    // meaning the caller's cwd.
    process.env[CALLER_CWD_ENV] ??= process.cwd();
    process.chdir(result.projectRoot);
  }
  return result;
}
