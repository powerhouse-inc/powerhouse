import type {
  BuiltPiece,
  DetectionCache,
  ExternalDependency,
  PiecePlan,
  TraceFiles,
} from "@powerhousedao/shared/build-pieces";
import type { Agent } from "package-manager-detector";
import type { NormalizedPackageJson } from "read-pkg";
import type { BuildArgs } from "../../../types.js";
import type { ReleaseCheck } from "../../release/evidence.js";
import type { FileDigest } from "../../release/revision.js";
import type { BuildStep } from "../pipeline/steps.js";
import type { BuildSession } from "../staging/session.js";

/** What one step learns that a later step reads. */
export type BuildFindings = {
  /** The package offers Connect routes (connect-routes). */
  offersRoutes: boolean;
  /** tsc reported no type errors (typecheck). */
  typesOk: boolean;
  /** Absolute paths tsc writes inside the package (typecheck). */
  compilerOutputs: readonly string[];
  /** The package's files when a release build started (release-start). */
  releaseStart: readonly FileDigest[] | undefined;
  /** The release profile's report and evidence (definitions, with --release). */
  release: ReleaseCheck | undefined;
  /** Native and WebAssembly packages the node bundle keeps external. */
  readonly external: Map<string, ExternalDependency>;
  /** package.json, as the node bundle read it. */
  pkg: NormalizedPackageJson | undefined;
  built: BuiltPiece[];
};

export type BuildContext = {
  readonly args: BuildArgs;
  readonly projectRoot: string;
  /** The output directory as given: `--out-dir`, default `dist`. */
  readonly outDir: string;
  readonly agent: Agent;
  readonly session: BuildSession;
  /** Check the definitions without `--release` too (definitions). */
  readonly checkDefinitions: boolean;
  readonly pieces: readonly PiecePlan[];
  /** Shared by the browser, node and piece builds: nothing is traced twice. */
  readonly detection: DetectionCache;
  readonly trace: TraceFiles;
  readonly findings: BuildFindings;
};

export type StandardBuildStep = BuildStep<BuildContext>;
