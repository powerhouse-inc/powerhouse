import { join } from "node:path";
import { checkInChild } from "./package-build/steps/definitions.js";
import type { StandardBuildStep } from "./package-build/steps/context.js";

/** The definitions step checks the package, subgraphs included, unless
 * discovery skips it, as it does for a package with no document model. */
async function definitionsStepCoversSubgraphs(
  projectRoot: string,
): Promise<boolean> {
  const { resolveDefinitionSelection } = await import("document-model/tooling");
  const selection = resolveDefinitionSelection({
    configFile: join(projectRoot, "powerhouse.config.json"),
    allowMissingConfig: true,
  });
  return selection.status !== "skipped";
}

/**
 * Checks a package's code-first subgraphs in `ph build`'s edit profile when
 * the definitions step does not: a package where discovery skips it. Under `--release` the definitions
 * step runs the release profile, which carries the subgraph checks and
 * refuses on their errors.
 */
export function subgraphStepWithin(timeoutMs: number): StandardBuildStep {
  return {
    id: "subgraphs",
    after: ["definitions"],
    run: async ({ args, checkDefinitions, projectRoot, session }) => {
      if (args.release || !checkDefinitions) return;
      if (await definitionsStepCoversSubgraphs(projectRoot)) return;
      const { renderCheckReport } = await import("./model/render.js");
      console.log("\n▶ Checking subgraph definitions...");
      const edit = await checkInChild(projectRoot, "edit", session, timeoutMs);
      if (!edit.ok) {
        console.warn(`⚠ The subgraph check could not run: ${edit.message}`);
        return;
      }
      const text = renderCheckReport(edit.result);
      if (edit.result.diagnostics.length > 0) {
        console.warn(
          `⚠ The subgraph check reported problems; the build goes on:\n${text}`,
        );
      } else {
        console.log(`✔ ${text}`);
      }
    },
  };
}

export const subgraphStep = subgraphStepWithin(5 * 60_000);
