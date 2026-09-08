import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { firstDifference } from "./utils.js";

export const B8_HOSTS = [
  "definition-source",
  "node-server",
  "http-cdn",
  "vite-local",
  "browser-static",
  "browser-worker",
  "graphql",
  "mcp",
  "connect",
  "reactor-worker",
  "registry",
] as const;

export type B8HostId = (typeof B8_HOSTS)[number];

export type LoaderHostResult = {
  readonly hostId: B8HostId;
  readonly importedNamespace: readonly string[];
  readonly acceptedExports: readonly string[];
  readonly selectedNamedWorkerReference: {
    readonly specifier: string;
    readonly exportName: string;
  } | null;
  readonly diagnostics: readonly string[];
  readonly registrationOutcome: string;
  readonly firstMismatch: string | null;
};

export type DefinitionSourceResult = {
  readonly sourceSetDigest: `sha256:${string}`;
  readonly normalizedSources: readonly string[];
  readonly acceptedExports: readonly string[];
  readonly importCount: number;
};

export type LoaderCompatibilityProbeResult = {
  readonly hosts: readonly LoaderHostResult[];
  readonly definitionSource: DefinitionSourceResult;
};

export type LoaderCompatibilityAssertion = {
  readonly id: `B8.${B8HostId}`;
  readonly outcome: "pass" | "fail";
  readonly failures: readonly string[];
};

export type LoaderCompatibilityEvaluation = {
  readonly assertions: readonly LoaderCompatibilityAssertion[];
  readonly hosts: readonly LoaderHostResult[];
};

type B8Manifest = {
  readonly cases: readonly { readonly caseId: B8HostId }[];
};

type HostGolden = Omit<LoaderHostResult, "hostId" | "firstMismatch">;
type HostGoldens = Readonly<Record<B8HostId, HostGolden>>;

const marker = "__PH_B8_RESULT__";

export function runLoaderCompatibilityCases(
  packageRoot = resolve(import.meta.dirname, "../.."),
): LoaderCompatibilityProbeResult {
  const stdout = execFileSync(
    process.execPath,
    ["--import", "tsx", "scripts/probe-loader-compatibility.mts"],
    {
      cwd: packageRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  const index = stdout.lastIndexOf(marker);
  if (index < 0) throw new Error("The B8 host probe emitted no result marker.");
  return JSON.parse(
    stdout.slice(index + marker.length).trim(),
  ) as LoaderCompatibilityProbeResult;
}

export function hostNamespaceGoldens(
  hosts: readonly LoaderHostResult[],
): HostGoldens {
  return Object.fromEntries(
    hosts.map(({ hostId, firstMismatch: _firstMismatch, ...observation }) => [
      hostId,
      observation,
    ]),
  ) as unknown as HostGoldens;
}

export async function evaluateLoaderCompatibility(
  manifestPath: string,
): Promise<LoaderCompatibilityEvaluation> {
  const fixtureRoot = dirname(manifestPath);
  const [manifest, expectedDefinitionSource, expectedHosts] = await Promise.all(
    [
      readFile(manifestPath, "utf8").then(
        (value) => JSON.parse(value) as B8Manifest,
      ),
      readFile(
        resolve(fixtureRoot, "definition-source-results.json"),
        "utf8",
      ).then((value) => JSON.parse(value) as DefinitionSourceResult),
      readFile(resolve(fixtureRoot, "host-namespaces.json"), "utf8").then(
        (value) => JSON.parse(value) as HostGoldens,
      ),
    ],
  );
  const current = runLoaderCompatibilityCases(resolve(fixtureRoot, "../../.."));
  const manifestDifference = firstDifference(
    manifest.cases.map(({ caseId }) => caseId),
    current.hosts.map(({ hostId }) => hostId),
  );
  const definitionDifference = firstDifference(
    expectedDefinitionSource,
    current.definitionSource,
  );
  const hosts = current.hosts.map((host) => {
    const { hostId, firstMismatch, ...observation } = host;
    const goldenDifference = firstDifference(
      expectedHosts[hostId],
      observation,
    );
    return {
      ...host,
      firstMismatch:
        firstMismatch ??
        goldenDifference ??
        (hostId === "definition-source" ? definitionDifference : null) ??
        manifestDifference,
    };
  });
  return {
    assertions: B8_HOSTS.map((hostId) => {
      const result = hosts.find((host) => host.hostId === hostId);
      const failures = result?.firstMismatch
        ? [result.firstMismatch]
        : result
          ? []
          : [`${hostId} was not executed`];
      return {
        id: `B8.${hostId}` as const,
        outcome: failures.length === 0 ? "pass" : "fail",
        failures,
      };
    }),
    hosts,
  };
}
