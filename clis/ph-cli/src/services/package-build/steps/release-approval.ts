import { isAbsolute } from "node:path";
import { getVersion } from "../../../get-version.js";
import {
  PH_CLI_BINDING,
  RELEASE_APPROVAL_PATH,
} from "../../release/approval.js";
import {
  packagePath,
  publishedFiles,
  revisionFiles,
  writeReleaseApproval,
} from "../../release/files.js";
import { changedWhileBuilt, planApproval } from "../../release/issuance.js";
import { type FileDigest, packageRevision } from "../../release/revision.js";
import { BuildRefusal } from "../pipeline/steps.js";
import type { BuildFindings, StandardBuildStep } from "./context.js";

const under = (path: string, directory: string) =>
  path === directory || path.startsWith(`${directory}/`);

/**
 * The output directory as given, then the directory the build replaces when
 * that is a symlink to another place in the package: neither is a source.
 */
function outputDirectories(
  projectRoot: string,
  outDir: string,
  target: string,
): [string, ...string[]] {
  const output = packagePath(projectRoot, outDir);
  const real = packagePath(projectRoot, target);
  const inPackage =
    real !== ".." && !real.startsWith("../") && !isAbsolute(real);
  return inPackage && !under(real, output) ? [output, real] : [output];
}

/** With `--release`, records the package's files before anything is built. */
export const releaseStartStep: StandardBuildStep = {
  id: "release-start",
  run: ({ args, projectRoot, outDir, session, findings }) => {
    if (args.release) {
      findings.releaseStart = revisionFiles(
        projectRoot,
        outputDirectories(projectRoot, outDir, session.output),
      );
    }
    return Promise.resolve();
  },
};

const notWritten = (why: string) =>
  new BuildRefusal(
    `✘ No release approval was written: ${why}. The new output is in place; build again with --release to approve it.`,
  );

/**
 * With `--release`, once the output is replaced: records what the release
 * check approved and what `npm pack` publishes from the new output, unless
 * tsc's errors were accepted or the package changed while it was built.
 */
export const releaseApprovalStep: StandardBuildStep = {
  id: "release-approval",
  when: "committed",
  run: ({ args, projectRoot, outDir, session, findings }) => {
    if (args.release) {
      recordApproval(
        projectRoot,
        outputDirectories(projectRoot, outDir, session.output),
        findings,
      );
    }
    return Promise.resolve();
  },
};

function recordApproval(
  projectRoot: string,
  outputs: readonly [string, ...string[]],
  findings: BuildFindings,
): void {
  const plan = planApproval({
    typesOk: findings.typesOk,
    release: findings.release,
    startFiles: findings.releaseStart,
    outputs,
    compilerOutputs: findings.compilerOutputs.map((path) =>
      packagePath(projectRoot, path),
    ),
  });
  if ("refused" in plan) throw notWritten(plan.refused);
  const { release, excluded } = plan;
  const [output] = outputs;
  const files = revisionFiles(projectRoot, [output, ...excluded]);
  const changed = changedWhileBuilt(plan, files);
  if (changed !== undefined) throw notWritten(changed);
  let published: FileDigest[];
  try {
    published = publishedFiles(projectRoot);
  } catch (error) {
    throw notWritten(error instanceof Error ? error.message : String(error));
  }
  const phCliVersion = getVersion();
  writeReleaseApproval(projectRoot, {
    kind: "powerhouse.release-approval",
    formatVersion: 1,
    phCliVersion,
    outDir: output,
    packageRevision: {
      digest: packageRevision(files, { [PH_CLI_BINDING]: phCliVersion }),
      excluded,
    },
    publishedFiles: published,
    report: {
      profile: "release",
      status: release.report.status,
      definitions: release.report.definitions,
    },
    scalars: release.scalars,
    hostValidation: release.host,
  });
  console.log(`✔ Release approval written to ${RELEASE_APPROVAL_PATH}`);
}
