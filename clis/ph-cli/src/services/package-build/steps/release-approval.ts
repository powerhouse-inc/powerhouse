import { existsSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { getVersion } from "../../../get-version.js";
import {
  listed,
  PH_CLI_BINDING,
  RELEASE_APPROVAL_PATH,
} from "../../release/approval.js";
import { checkPackedConsumer } from "../../release/consumer.js";
import {
  packagePath,
  revisionFiles,
  writeReleaseApproval,
} from "../../release/files.js";
import { changedWhileBuilt, planApproval } from "../../release/issuance.js";
import {
  packedDigests,
  packRelease,
  type PackedRelease,
} from "../../release/pack.js";
import { type FileDigest, packageRevision } from "../../release/revision.js";
import { BuildRefusal } from "../pipeline/steps.js";
import type { BuildSession } from "../staging/session.js";
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

/** Exports `ph init` declares whose entry the build skips when its source is absent. */
const OPTIONAL_EXPORTS: Readonly<Record<string, string>> = {
  "./scalars": "scalars/index.ts",
  "./pieces": "pieces/index.ts",
};

const unbuiltExports = (projectRoot: string, findings: BuildFindings) =>
  new Set([
    ...Object.entries(OPTIONAL_EXPORTS)
      .filter(([, source]) => !existsSync(join(projectRoot, source)))
      .map(([subpath]) => subpath),
    ...(findings.offersRoutes ? [] : ["./connect-routes"]),
  ]);

const notWritten = (why: string) =>
  new BuildRefusal(
    `✘ No release approval was written: ${why}. The new output is in place; build again with --release to approve it.`,
  );

/**
 * With `--release`, once the output is replaced: records what the release
 * check approved and what `npm pack` publishes from the new output, unless
 * tsc's errors were accepted, the package changed while it was built, or the
 * packed tarball fails to install and import in a scratch consumer.
 */
export const releaseApprovalStep: StandardBuildStep = {
  id: "release-approval",
  when: "committed",
  run: async ({ args, projectRoot, outDir, session, findings }) => {
    if (args.release) {
      await recordApproval(
        projectRoot,
        outputDirectories(projectRoot, outDir, session.output),
        findings,
        session,
      );
    }
  },
};

async function recordApproval(
  projectRoot: string,
  outputs: readonly [string, ...string[]],
  findings: BuildFindings,
  session: BuildSession,
): Promise<void> {
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
  let packed: PackedRelease;
  try {
    packed = packRelease(projectRoot);
  } catch (error) {
    throw notWritten(error instanceof Error ? error.message : String(error));
  }
  let published: FileDigest[];
  const stop = new AbortController();
  const unwatch = session.onCancel(() => {
    stop.abort();
    packed.dispose();
  });
  try {
    const failures = await checkPackedConsumer(
      projectRoot,
      packed,
      unbuiltExports(projectRoot, findings),
      stop.signal,
    );
    if (failures.length > 0) {
      throw notWritten(
        `the packed package does not install and import in a scratch consumer: ${listed(failures)}`,
      );
    }
    published = packedDigests(packed);
  } finally {
    unwatch();
    packed.dispose();
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
