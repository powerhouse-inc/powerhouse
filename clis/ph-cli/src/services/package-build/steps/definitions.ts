import type { DefinitionCheckReport } from "@powerhousedao/shared/document-model";
import { fork } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import type {
  DefinitionsProfile,
  DefinitionsReply,
} from "../../model/definitions-worker.js";
import type { BuildSession } from "../staging/session.js";
import { BuildRefusal } from "../pipeline/steps.js";
import type { StandardBuildStep } from "./context.js";

/**
 * The built worker beside ph-cli's own code. Run from source (under vitest),
 * the TypeScript worker through tsx, so a test runs the current source.
 */
function definitionsWorker(): { path: string; execArgv: string[] } {
  const root = dirname(
    createRequire(import.meta.url).resolve(
      "@powerhousedao/ph-cli/package.json",
    ),
  );
  if (!import.meta.url.endsWith(".ts")) {
    return { path: join(root, "dist", "definitions-worker.mjs"), execArgv: [] };
  }
  return {
    path: join(root, "src", "services", "model", "definitions-worker.ts"),
    execArgv: ["--import", import.meta.resolve("tsx")],
  };
}

/**
 * Runs the definition check in a child process: the package's own modules
 * can exit, hang or start timers there without reaching the build. A child
 * that ends without a reply, outlives `timeoutMs` or outlives a stop of the
 * build is killed, and the reply says why the check could not run.
 */
function checkInChild<P extends DefinitionsProfile>(
  projectRoot: string,
  profile: P,
  session: BuildSession,
  timeoutMs: number,
): Promise<DefinitionsReply<P>> {
  const worker = definitionsWorker();
  return new Promise((resolve) => {
    let reply: DefinitionsReply<P> | undefined;
    let killedFor: string | undefined;
    // The package's modules print to the build's stderr, as under `ph model`.
    const child = fork(worker.path, [projectRoot, profile], {
      cwd: projectRoot,
      execArgv: worker.execArgv,
      stdio: ["ignore", 2, 2, "ipc"],
    });
    const kill = (why: string) => {
      killedFor ??= why;
      child.kill("SIGKILL");
    };
    const timer = setTimeout(
      () => kill(`the check did not finish within ${timeoutMs / 1000} seconds`),
      timeoutMs,
    );
    // Synchronous, inside the signal handler: a worker stuck in a loop
    // cannot notice its parent is gone, so it must die before the parent.
    const unwatch = session.onCancel(() => kill("the build was stopped"));
    if (session.stopped()) kill("the build was stopped");
    const settle = (settled: DefinitionsReply<P>) => {
      clearTimeout(timer);
      unwatch();
      resolve(settled);
    };
    child.on("message", (message) => {
      reply ??= message as DefinitionsReply<P>;
    });
    child.on("error", (error) => {
      kill(error.message);
      settle({ ok: false, message: error.message });
    });
    child.on("exit", (code, signal) => {
      settle(
        reply ?? {
          ok: false,
          message:
            killedFor ??
            `the check ${signal ? `was stopped by ${signal}` : `exited with code ${code}`} before it reported`,
        },
      );
    });
  });
}

/**
 * Checks the package's definitions after tsc and before any bundle, when
 * `ph build` asks or with `--release`. Without `--release` it checks the
 * package when discovery finds a code-first model directory or cannot read
 * the models directory, never stops the build, and skips without a word a
 * package with no code-first model. With `--release`
 * (experimental) it runs the release profile over every model, stored ones
 * included, and stops the build when the check is invalid or cannot run, a
 * configuration error included. The package's modules load only in the
 * definitions worker, which has `timeoutMs` to report.
 */
export function definitionsStepWithin(timeoutMs: number): StandardBuildStep {
  return {
    id: "definitions",
    after: ["typecheck"],
    run: async ({ args, checkDefinitions, projectRoot, session, findings }) => {
      if (!args.release && !checkDefinitions) return;
      if (!args.release) {
        const { resolveDefinitionSelection } =
          await import("document-model/tooling");
        const selection = resolveDefinitionSelection({
          configFile: join(projectRoot, "powerhouse.config.json"),
          allowMissingConfig: true,
        });
        if (selection.status === "skipped") return;
      }
      const { renderCheckReport } = await import("../../model/render.js");
      const printReport = (report: DefinitionCheckReport) => {
        const text = renderCheckReport(report);
        if (report.diagnostics.length > 0) {
          console.warn(
            `⚠ The definition check reported problems; the build goes on:\n${text}`,
          );
        } else {
          console.log(`✔ ${text}`);
        }
      };
      console.log("\n▶ Checking document model definitions...");
      if (!args.release) {
        const edit = await checkInChild(
          projectRoot,
          "edit",
          session,
          timeoutMs,
        );
        if (edit.ok) printReport(edit.result);
        else
          console.warn(`⚠ The definition check could not run: ${edit.message}`);
        return;
      }
      const release = await checkInChild(
        projectRoot,
        "release",
        session,
        timeoutMs,
      );
      if (!release.ok) {
        throw new BuildRefusal(
          `✘ The definition check could not run: ${release.message}`,
        );
      }
      const { status } = release.result.report;
      if (status === "invalid" || status === "failed") {
        throw new BuildRefusal(
          `✘ The release definition check stopped the build:\n${renderCheckReport(release.result.report)}`,
        );
      }
      findings.release = release.result;
      printReport(release.result.report);
    },
  };
}

export const definitionsStep = definitionsStepWithin(5 * 60_000);
