import { execSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { type Agent, resolveCommand } from "package-manager-detector";
import { BuildRefusal } from "../pipeline/steps.js";
import { BUILD_DIRECTORY } from "../../build-control.js";
import {
  declarationDirectory,
  type EmitOptions,
} from "../../compiler-output/emit.js";
import { compilerOutputs } from "../staging/compiler.js";
import { parseShownConfig, type ShownConfig } from "../staging/inventory.js";
import type { StandardBuildStep } from "./context.js";

const TYPE_ERROR_RISK =
  "A package built with type errors can load and still fail at runtime.";

export const UNSAFE_BUILD_WARNING =
  "⚠ Built despite type errors. " +
  TYPE_ERROR_RISK +
  " Fix them before you publish or deploy it.";

/** The root project's config, as `tsc --showConfig` prints it. */
function showCompilerConfig(
  agent: Agent,
  projectRoot: string,
): ShownConfig | undefined {
  const showConfig = resolveCommand(agent, "execute-local", [
    "tsc",
    "--showConfig",
  ]);
  if (showConfig === null) return undefined;
  try {
    const output = execSync(
      `${showConfig.command} ${showConfig.args.join(" ")}`,
      {
        cwd: projectRoot,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      },
    );
    return parseShownConfig(output);
  } catch {
    return undefined;
  }
}

// tsc's build info outlives a deleted dist; with the declarations gone, tsc
// would call the project up to date and emit nothing.
function declarationsMissing(
  options: EmitOptions,
  projectRoot: string,
): boolean {
  const path = declarationDirectory(options, projectRoot);
  if (path === undefined) return false;
  return !existsSync(path) || readdirSync(path).length === 0;
}

function isInteractive(): boolean {
  return Boolean(process.stdin.isTTY) && !process.env.CI;
}

async function confirmBuildDespiteTypeErrors(): Promise<void> {
  const hint =
    "Fix them and build again. --ignore-type-errors skips this check, at the risk of shipping that failure.";
  if (!isInteractive()) {
    throw new BuildRefusal(
      `\n✘ tsc reported the type errors above. ${TYPE_ERROR_RISK}\n${hint}`,
    );
  }
  const enquirer = await import("enquirer");
  let confirmed: boolean;
  try {
    const answer = await enquirer.default.prompt<{ confirmed: boolean }>({
      type: "confirm",
      name: "confirmed",
      message: `tsc reported the type errors above. ${TYPE_ERROR_RISK} Build anyway?`,
      initial: false,
    });
    confirmed = answer.confirmed;
  } catch {
    // Ctrl-C at the prompt is a decline.
    confirmed = false;
  }
  if (!confirmed) throw new BuildRefusal(`Build cancelled. ${hint}`);
}

/**
 * Runs tsc, which checks the project and writes its declarations either way,
 * as `tsc --build` in the package: the same command, build info and output
 * places as without staging. When the session can, tsc builds a generated
 * sibling config that writes into the stage; otherwise what it rewrites is
 * copied first, so a build that does not finish puts it back.
 */
export const typecheckStep: StandardBuildStep = {
  id: "typecheck",
  run: async ({ agent, args, outDir, projectRoot, session, findings }) => {
    const config = showCompilerConfig(agent, projectRoot);
    const force =
      config !== undefined && declarationsMissing(config.options, projectRoot);
    let generated: string | undefined;
    if (config !== undefined) {
      const configFile = join(projectRoot, "tsconfig.json");
      const outputs = await compilerOutputs(config, {
        configFile,
        packageRoot: projectRoot,
        buildDirectory: join(projectRoot, BUILD_DIRECTORY),
        agent,
        output: session.output,
      });
      generated = await session.prepareCompiler({
        configFile,
        config,
        outputs,
      });
      findings.compilerOutputs = outputs.map(({ path }) => path);
    }
    const tscCommand = resolveCommand(agent, "execute-local", [
      "tsc",
      "--build",
      ...(force ? ["--force"] : []),
      ...(generated ? [relative(projectRoot, generated)] : []),
    ]);
    if (tscCommand === null) {
      throw new BuildRefusal(
        "You need to have typescript installed to use the `build` command.",
      );
    }
    console.log("\n▶ Type-checking and emitting types via tsc...");
    try {
      execSync(`${tscCommand.command} ${tscCommand.args.join(" ")}`, {
        stdio: "inherit",
      });
      console.log("✔ Types emitted to", join(outDir, "types"));
      findings.typesOk = true;
    } catch {
      findings.typesOk = false;
    }
    session.compilerOutputsWritten();
    // Before any bundler runs, so declining leaves nothing half built.
    if (!findings.typesOk && !args.ignoreTypeErrors) {
      await confirmBuildDespiteTypeErrors();
    }
  },
};
