import { listed } from "./approval.js";
import { changedPaths, type FileDigest } from "./revision.js";

const under = (path: string, directory: string) =>
  path === directory || path.startsWith(`${directory}/`);

/** What a release build learned that decides whether it may write an approval. Paths are POSIX, from the package root. */
export type ApprovalBuild<Release> = {
  readonly typesOk: boolean;
  /** The release profile's result, when it ran. */
  readonly release: Release | undefined;
  /** The package's files when the build started. */
  readonly startFiles: readonly FileDigest[] | undefined;
  /** The output directory as given, then the directory the build replaced when that is elsewhere in the package. */
  readonly outputs: readonly [string, ...string[]];
  /** What tsc writes. */
  readonly compilerOutputs: readonly string[];
};

export type ApprovalPlan<Release> =
  | { readonly refused: string }
  | {
      readonly release: Release;
      readonly startFiles: readonly FileDigest[];
      /** What the revision leaves out besides the output directory: neither is a source. */
      readonly excluded: readonly string[];
    };

/**
 * Whether a release build may write an approval, and what its revision
 * leaves out: the replaced directory, and what tsc writes outside the
 * output.
 */
export function planApproval<Release>(
  build: ApprovalBuild<Release>,
): ApprovalPlan<Release> {
  const { release, startFiles, outputs } = build;
  if (!build.typesOk) {
    return { refused: "the build went on despite tsc's type errors" };
  }
  if (release === undefined || startFiles === undefined) {
    return { refused: "the release check did not run" };
  }
  const excluded = [
    ...outputs.slice(1),
    ...build.compilerOutputs.filter(
      (path) => !outputs.some((directory) => under(path, directory)),
    ),
  ];
  return { release, startFiles, excluded };
}

/**
 * Why the approval may not be written because the package changed while it
 * was built, comparing its files at the start, minus what the revision
 * leaves out, with `endFiles`; undefined when nothing changed.
 */
export function changedWhileBuilt(
  plan: {
    readonly startFiles: readonly FileDigest[];
    readonly excluded: readonly string[];
  },
  endFiles: readonly FileDigest[],
): string | undefined {
  const leftOut = (path: string) =>
    plan.excluded.some((exclusion) => under(path, exclusion));
  const changed = changedPaths(
    plan.startFiles.filter(({ path }) => !leftOut(path)),
    endFiles,
  );
  return changed.length === 0
    ? undefined
    : `the package's files changed while it was built (${listed(changed)})`;
}
