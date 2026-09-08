import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  B5_CASE_IDS,
  digestValue,
  probePackedConsumers,
  type B5CaseId,
  type PackedConsumerObservation,
  type PackedConsumerResult,
  type PackedDependencyTree,
  type PackedFileManifest,
  type PackedLogicalDefinition,
  type PackedResolverTrace,
} from "./packed-consumers-probe.js";
import { firstDifference, sha256 } from "./utils.js";

export type PackedConsumerAssertion = {
  readonly id:
    | "B5.pack"
    | "B5.node-types"
    | "B5.browser-types"
    | "B5.node-import"
    | "B5.worker-import"
    | "B5.portability";
  readonly outcome: "pass" | "fail";
  readonly failures: readonly string[];
};

export type PackedConsumerEvaluation = {
  readonly assertions: readonly PackedConsumerAssertion[];
  readonly consumers: readonly PackedConsumerResult[];
};

type PackedConsumerCase = {
  readonly caseId: B5CaseId;
  readonly consumerSource: string;
  readonly runtimeEntry: string;
  readonly tarball: {
    readonly path: string;
    readonly digest: `sha256:${string}`;
  };
  readonly lockfileDigest: `sha256:${string}`;
  readonly exportPaths: {
    readonly root: string;
    readonly documentModels: string;
    readonly declaration: string;
  };
  readonly runtimeConditions: readonly string[];
  readonly expectedLogicalDefinitions: readonly PackedLogicalDefinition[];
  readonly expectedActionType: string;
  readonly coveredVariants: readonly string[];
};

type PackedConsumerManifest = {
  readonly cases: readonly PackedConsumerCase[];
};

function caseById(
  cases: readonly PackedConsumerCase[],
  caseId: B5CaseId,
): PackedConsumerCase {
  const result = cases.find((candidate) => candidate.caseId === caseId);
  if (!result) throw new Error(`The B5 manifest has no ${caseId} case.`);
  return result;
}

function observationById(
  observations: readonly PackedConsumerObservation[],
  caseId: B5CaseId,
): PackedConsumerObservation {
  const result = observations.find((candidate) => candidate.caseId === caseId);
  if (!result) throw new Error(`The B5 probe did not execute ${caseId}.`);
  return result;
}

function expectedResolvedPath(
  caseFixture: PackedConsumerCase,
  key: "root" | "documentModels" | "declaration",
): string {
  return `node_modules/@powerhousedao/code-first-packed-fixture/${caseFixture.exportPaths[
    key
  ].replace(/^\.\//, "")}`;
}

function resultProjection(
  observation: PackedConsumerObservation,
): PackedConsumerResult {
  const {
    projection: _projection,
    actionType: _actionType,
    splitEntryMatches: _splitEntryMatches,
    resolvedEntries: _resolvedEntries,
    installedPackageIsSymlink: _installedPackageIsSymlink,
    lockfileUsesLocalTarball: _lockfileUsesLocalTarball,
    ...result
  } = observation;
  return result;
}

export async function evaluatePackedConsumers(
  manifestPath: string,
): Promise<PackedConsumerEvaluation> {
  const fixtureRoot = dirname(manifestPath);
  const packageRoot = resolve(fixtureRoot, "../..");
  const [
    manifest,
    expectedFileManifest,
    expectedDependencyTrees,
    expectedResolverTraces,
  ] = await Promise.all([
    readFile(manifestPath, "utf8").then(
      (value) => JSON.parse(value) as PackedConsumerManifest,
    ),
    readFile(resolve(fixtureRoot, "packed-file-manifest.json"), "utf8").then(
      (value) => JSON.parse(value) as PackedFileManifest,
    ),
    readFile(resolve(fixtureRoot, "dependency-tree.json"), "utf8").then(
      (value) =>
        JSON.parse(value) as Readonly<Record<B5CaseId, PackedDependencyTree>>,
    ),
    readFile(resolve(fixtureRoot, "resolver-trace.json"), "utf8").then(
      (value) =>
        JSON.parse(value) as Readonly<Record<B5CaseId, PackedResolverTrace>>,
    ),
  ]);
  const current = await probePackedConsumers({ packageRoot });
  const nodeCase = caseById(manifest.cases, "node");
  const browserCase = caseById(manifest.cases, "browser-worker");
  const node = observationById(current.consumers, "node");
  const browser = observationById(current.consumers, "browser-worker");
  const committedTarball = await readFile(
    resolve(fixtureRoot, nodeCase.tarball.path.replace(/^\.\//, "")),
  );

  const packFailures = [
    current.tarballDigest === nodeCase.tarball.digest &&
    current.tarballDigest === browserCase.tarball.digest &&
    current.tarballDigest === sha256(committedTarball)
      ? null
      : "the rebuilt, manifest, and committed tarball digests differ",
    firstDifference(
      expectedFileManifest,
      current.packedFileManifest,
      "$.packedFileManifest",
    ),
    current.packedFileManifestDigest === digestValue(expectedFileManifest)
      ? null
      : "the packed file manifest digest differs",
  ].filter((failure): failure is string => failure !== null);

  const typeFailures = (
    observation: PackedConsumerObservation,
    caseFixture: PackedConsumerCase,
  ): string[] =>
    [
      observation.declarationEntry ===
      expectedResolvedPath(caseFixture, "declaration")
        ? null
        : `${caseFixture.caseId} resolved ${observation.declarationEntry}`,
      observation.declarationBytes > 0
        ? null
        : `${caseFixture.caseId} emitted no declarations`,
      firstDifference(
        expectedResolverTraces[caseFixture.caseId],
        current.resolverTraces[caseFixture.caseId],
        `$.resolverTrace.${caseFixture.caseId}`,
      ),
      current.resolverTraces[caseFixture.caseId].requests.every(
        ({ resolved, matchedConditions }) =>
          resolved !== null && matchedConditions.includes("types"),
      )
        ? null
        : `${caseFixture.caseId} did not resolve every declaration through the types condition`,
    ].filter((failure): failure is string => failure !== null);

  const importFailures = (
    observation: PackedConsumerObservation,
    caseFixture: PackedConsumerCase,
  ): string[] =>
    [
      firstDifference(
        caseFixture.expectedLogicalDefinitions,
        observation.projection,
        `$.projection.${caseFixture.caseId}`,
      ),
      observation.actionType === caseFixture.expectedActionType
        ? null
        : `${caseFixture.caseId} emitted ${observation.actionType}`,
      observation.splitEntryMatches
        ? null
        : `${caseFixture.caseId} public entries produced different module identities`,
      observation.resolvedEntries.root ===
      expectedResolvedPath(caseFixture, "root")
        ? null
        : `${caseFixture.caseId} root resolved to ${observation.resolvedEntries.root}`,
      observation.resolvedEntries.documentModels ===
      expectedResolvedPath(caseFixture, "documentModels")
        ? null
        : `${caseFixture.caseId} document-model entry resolved to ${observation.resolvedEntries.documentModels}`,
    ].filter((failure): failure is string => failure !== null);

  const portabilityFailures = current.consumers.flatMap((observation) => {
    const caseFixture = caseById(manifest.cases, observation.caseId);
    return [
      observation.escapedPaths.length === 0
        ? null
        : `${observation.caseId} escaped: ${observation.escapedPaths.join(", ")}`,
      observation.installedPackageIsSymlink
        ? `${observation.caseId} installed through a symlink`
        : null,
      observation.lockfileUsesLocalTarball
        ? null
        : `${observation.caseId} lockfile did not use file:package.tgz`,
      observation.lockfileDigest === caseFixture.lockfileDigest
        ? null
        : `${observation.caseId} lockfile digest differs`,
      caseFixture.runtimeConditions.includes("source")
        ? `${observation.caseId} requested the forbidden source condition`
        : null,
      firstDifference(
        expectedDependencyTrees[observation.caseId],
        current.dependencyTrees[observation.caseId],
        `$.dependencyTree.${observation.caseId}`,
      ),
      Object.keys(current.dependencyTrees[observation.caseId].dependencies)
        .length === 1 &&
      current.dependencyTrees[observation.caseId].dependencies[
        "@powerhousedao/code-first-packed-fixture"
      ]?.version === "0.0.0"
        ? null
        : `${observation.caseId} installed undeclared dependencies`,
    ].filter((failure): failure is string => failure !== null);
  });

  const nodeImportFailures = importFailures(node, nodeCase);
  const workerImportFailures = importFailures(browser, browserCase);
  if (
    browser.workerHandshake?.status !== "ok" ||
    browser.workerHandshake.actionType !== browserCase.expectedActionType ||
    !browser.workerHandshake.splitEntryMatches
  ) {
    workerImportFailures.push("the browser worker handshake was incomplete");
  }
  const assertion = (
    id: PackedConsumerAssertion["id"],
    failures: readonly string[],
  ): PackedConsumerAssertion => ({
    id,
    outcome: failures.length === 0 ? "pass" : "fail",
    failures,
  });
  return {
    assertions: [
      assertion("B5.pack", packFailures),
      assertion("B5.node-types", typeFailures(node, nodeCase)),
      assertion("B5.browser-types", typeFailures(browser, browserCase)),
      assertion("B5.node-import", nodeImportFailures),
      assertion("B5.worker-import", workerImportFailures),
      assertion("B5.portability", portabilityFailures),
    ],
    consumers: current.consumers.map(resultProjection),
  };
}
