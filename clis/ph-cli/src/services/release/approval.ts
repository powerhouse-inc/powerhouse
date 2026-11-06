import { z } from "zod";
import { type FileDigest, packageRevision } from "./revision.js";

/** Where `ph build --release` records its approval, relative to the package root. */
export const RELEASE_APPROVAL_PATH = ".ph/build/release-approval.json";

/** The binding key of the ph-cli version in the package revision. */
export const PH_CLI_BINDING = "ph-cli";

const fileDigest = z.object({
  path: z.string(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
});

const hostFinding = z.looseObject({
  kind: z.enum([
    "scalar-unbound",
    "scalar-mismatch",
    "scalar-uncomparable",
    "definition-invalid",
    "definition-mismatch",
  ]),
  documentType: z.string(),
  scalar: z.string().optional(),
});

const approvalSchema = z.object({
  kind: z.literal("powerhouse.release-approval"),
  formatVersion: z.literal(1),
  phCliVersion: z.string(),
  /** POSIX, relative to the package root: the output directory the build replaced. */
  outDir: z.string(),
  packageRevision: z.object({
    digest: z.templateLiteral(["sha256:", z.string()]),
    /** Compiler outputs left out besides the fixed exclusions, POSIX and package relative. */
    excluded: z.array(z.string()).readonly(),
  }),
  /** What `npm pack` publishes, sorted by path. */
  publishedFiles: z.array(fileDigest).readonly(),
  report: z.object({
    profile: z.literal("release"),
    status: z.enum(["ok", "invalid", "failed", "skipped"]),
    definitions: z
      .array(z.looseObject({ kind: z.string(), key: z.string() }))
      .readonly(),
  }),
  scalars: z
    .array(
      z.object({
        scalar: z.string(),
        packageName: z.string(),
        version: z.string().nullable(),
      }),
    )
    .readonly(),
  hostValidation: z.discriminatedUnion("completed", [
    z.object({
      completed: z.literal(true),
      findings: z.array(hostFinding).readonly(),
    }),
    z.object({
      completed: z.literal(false),
      reason: z.string(),
      findings: z.array(hostFinding).readonly(),
    }),
  ]),
});

/** `.ph/build/release-approval.json`: what a successful `ph build --release` checked and built. */
export type ReleaseApproval = z.infer<typeof approvalSchema>;

/** One scalar the package's models use, and the package and version that provide it. */
export type ScalarBinding = ReleaseApproval["scalars"][number];

export type ApprovalRead =
  | { readonly kind: "missing" }
  | { readonly kind: "unreadable"; readonly reason: string }
  | { readonly kind: "found"; readonly approval: ReleaseApproval };

/** Parses an approval file's text. */
export function parseReleaseApproval(
  text: string,
): Exclude<ApprovalRead, { kind: "missing" }> {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { kind: "unreadable", reason: "it is not JSON" };
  }
  const parsed = approvalSchema.safeParse(json);
  if (parsed.success) return { kind: "found", approval: parsed.data };
  const [issue] = parsed.error.issues;
  const at = issue.path.length > 0 ? ` at ${issue.path.join(".")}` : "";
  return {
    kind: "unreadable",
    reason: `it is not an approval this ph-cli reads (${issue.message}${at})`,
  };
}

/** The package as it is now, read with the approval's output directory and exclusions. */
export type CurrentRelease = {
  readonly phCliVersion: string;
  /** The files the package revision reads. */
  readonly files: readonly FileDigest[];
  readonly publishedFiles: readonly FileDigest[];
};

type Reasons = readonly [string, ...string[]];

/** Whether the package may be published as the approval describes it, and why not. */
export type ReleaseDecision =
  | { readonly decision: "approved"; readonly reasons: readonly [] }
  | {
      readonly decision: "missing" | "unreadable" | "stale" | "refused";
      readonly reasons: Reasons;
    };

/** The decision when there is no approval to compare. */
export function decisionWithoutApproval(
  read: Exclude<ApprovalRead, { kind: "found" }>,
): ReleaseDecision {
  return read.kind === "missing"
    ? {
        decision: "missing",
        reasons: [
          `there is no release approval (${RELEASE_APPROVAL_PATH}); ph build --release writes one`,
        ],
      }
    : {
        decision: "unreadable",
        reasons: [
          `the release approval (${RELEASE_APPROVAL_PATH}) cannot be read: ${read.reason}`,
        ],
      };
}

const LISTED = 5;

/** Up to five items, then how many more. */
export function listed(items: readonly string[]): string {
  const shown = items.slice(0, LISTED).join(", ");
  return items.length > LISTED
    ? `${shown} and ${items.length - LISTED} more`
    : shown;
}

const plural = (count: number, one: string, many: string) =>
  `${count} ${count === 1 ? one : many}`;

function describeFinding(
  finding: ReleaseApproval["hostValidation"]["findings"][number],
): string {
  return finding.scalar === undefined
    ? `${finding.kind} in ${finding.documentType}`
    : `${finding.kind} ${finding.scalar} in ${finding.documentType}`;
}

function refusalReasons(approval: ReleaseApproval): string[] {
  const { report, hostValidation } = approval;
  const reasons: string[] = [];
  if (report.status === "invalid" || report.status === "failed") {
    reasons.push(`its release check reported ${report.status}`);
  }
  if (!hostValidation.completed) {
    reasons.push(`host validation did not complete: ${hostValidation.reason}`);
  }
  if (hostValidation.findings.length > 0) {
    reasons.push(
      `host validation found ${plural(hostValidation.findings.length, "problem", "problems")}: ${listed(hostValidation.findings.map(describeFinding))}`,
    );
  }
  return reasons;
}

function staleReasons(
  approval: ReleaseApproval,
  current: CurrentRelease,
): string[] {
  const reasons: string[] = [];
  if (approval.phCliVersion !== current.phCliVersion) {
    reasons.push(
      `it was made by ph-cli ${approval.phCliVersion}, and this is ph-cli ${current.phCliVersion}`,
    );
  }
  // Under the approval's own binding, so a new ph-cli alone does not read as edited files.
  const revision = packageRevision(current.files, {
    [PH_CLI_BINDING]: approval.phCliVersion,
  });
  if (revision !== approval.packageRevision.digest) {
    reasons.push("the package's files changed since the approval was made");
  }
  const approved = new Map(
    approval.publishedFiles.map(({ path, sha256 }) => [path, sha256]),
  );
  const now = new Map(
    current.publishedFiles.map(({ path, sha256 }) => [path, sha256]),
  );
  const added = [...now.keys()].filter((path) => !approved.has(path));
  const removed = [...approved.keys()].filter((path) => !now.has(path));
  const changed = [...now].filter(
    ([path, sha256]) => approved.has(path) && approved.get(path) !== sha256,
  );
  const files = (paths: readonly string[], what: string) =>
    `${plural(paths.length, "published file", "published files")} ${what} since the approval was made: ${listed(paths)}`;
  if (added.length > 0) reasons.push(files(added, "added"));
  if (removed.length > 0) reasons.push(files(removed, "removed"));
  if (changed.length > 0) {
    reasons.push(
      files(
        changed.map(([path]) => path),
        "changed",
      ),
    );
  }
  return reasons;
}

function decided(
  decision: "stale" | "refused",
  reasons: readonly string[],
): ReleaseDecision | undefined {
  if (reasons.length === 0) return undefined;
  const [first, ...rest] = reasons;
  return { decision, reasons: [first, ...rest] };
}

/**
 * Whether the package as it is now is the one the approval checked. Refused
 * when the approval records a failed check; stale when ph-cli, the package's
 * files or the published files changed since.
 */
export function verifyReleaseApproval(
  approval: ReleaseApproval,
  current: CurrentRelease,
): ReleaseDecision {
  return (
    decided("refused", refusalReasons(approval)) ??
    decided("stale", staleReasons(approval, current)) ?? {
      decision: "approved",
      reasons: [],
    }
  );
}
