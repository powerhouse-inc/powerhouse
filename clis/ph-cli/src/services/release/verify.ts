import { getVersion } from "../../get-version.js";
import {
  type ApprovalRead,
  decisionWithoutApproval,
  type ReleaseDecision,
  verifyReleaseApproval,
} from "./approval.js";
import { publishedFiles, readReleaseApproval, revisionFiles } from "./files.js";
import { packedDigests, packRelease, type PackedRelease } from "./pack.js";
import type { FileDigest } from "./revision.js";

/**
 * Compares the package as it is now with its release approval: the files
 * the revision reads, with the output directory and exclusions the approval
 * records, and what `npm pack` publishes, or `published` when the caller
 * already packed it. Throws when either cannot be read.
 */
export function verifyRelease(
  packageRoot: string,
  read: ApprovalRead = readReleaseApproval(packageRoot),
  published?: readonly FileDigest[],
): ReleaseDecision {
  if (read.kind !== "found") return decisionWithoutApproval(read);
  const { approval } = read;
  return verifyReleaseApproval(approval, {
    phCliVersion: getVersion(),
    files: revisionFiles(packageRoot, [
      approval.outDir,
      ...approval.packageRevision.excluded,
    ]),
    publishedFiles: published ?? publishedFiles(packageRoot),
  });
}

const HEADLINES: Readonly<Record<ReleaseDecision["decision"], string>> = {
  approved: "the release approval matches this package",
  missing: "this package has no release approval",
  unreadable: "the release approval cannot be read",
  stale: "the release approval does not match this package",
  refused: "the release approval records a release check that did not pass",
};

/** The decision and each reason on its own line. */
export function renderReleaseDecision(decision: ReleaseDecision): string {
  return [
    `${decision.decision}: ${HEADLINES[decision.decision]}`,
    ...decision.reasons.map((reason) => `  - ${reason}`),
  ].join("\n");
}

/**
 * Whether `ph publish` goes on. With `--require-approval`, `packed` is the
 * tarball the approval was checked against: publish that file, and call its
 * `dispose` once done.
 */
export type PublishCheck =
  | { readonly proceed: false }
  | { readonly proceed: true; readonly packed?: PackedRelease };

/**
 * Checks the release approval before `ph publish` resolves a registry.
 * Without an approval file and without `required`, does nothing, as before
 * approvals existed. Otherwise a decision other than approved is a warning,
 * or with `required` a refusal.
 */
export function checkApprovalBeforePublish(
  packageRoot: string,
  required: boolean,
): PublishCheck {
  const read = readReleaseApproval(packageRoot);
  if (read.kind === "missing" && !required) return { proceed: true };
  let text: string;
  let packed: PackedRelease | undefined;
  let approved = false;
  try {
    if (required && read.kind === "found") packed = packRelease(packageRoot);
    const decision = verifyRelease(
      packageRoot,
      read,
      packed && packedDigests(packed),
    );
    approved = decision.decision === "approved";
    text = renderReleaseDecision(decision);
  } catch (error) {
    text = `the release approval could not be checked: ${error instanceof Error ? error.message : String(error)}`;
  }
  if (approved) {
    console.log(`✔ ${text}`);
    return { proceed: true, packed };
  }
  packed?.dispose();
  if (required) {
    console.error(
      `✘ ${text}\nph publish --require-approval publishes only an approved package. Run ph build --release, then publish again.`,
    );
    return { proceed: false };
  }
  console.warn(
    `⚠ ${text}\nPublishing anyway. Run ph build --release to approve this package, or pass --require-approval to stop here instead.`,
  );
  return { proceed: true };
}
