import { readdirSync } from "node:fs";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  expectHost,
  type ConsumedOutput,
  type ExpectedDrive,
  type HostExpectation,
  type MemberExpectation,
  type MemberInput,
} from "../src/expect-host.js";
import type { ChildWrapper, HostDefinition } from "../src/host-schemas.js";
import { loadHost } from "../src/host-loader.js";
import type { PluginEntryData } from "../src/plugins.js";
import { resolvePluginContributions } from "../src/plugins-resolve.js";
import { checkTokenSites, outputSitesOf } from "../src/resolve/declared.js";
import { loadProducers, runnerOutputsSchema } from "../src/resolve/node.js";
import { memberForRef, planCompound } from "../src/resolve/plan.js";
import {
  resolveHostOutputs,
  type OutputSource,
} from "../src/resolve/resolve.js";
import { compoundOutputSource } from "../src/resolve/sources.js";
import {
  ONE_SHOT_VERBS,
  resolveRunnerModule,
  validateDeclaredHost,
  validateHost,
  type RunnerModule,
} from "../src/runner-resolver.js";
import {
  BUILTINS,
  CANNED,
  cleanupProjects,
  ENV,
  FIXTURES,
  project,
  type Canned,
} from "./fixture-project.js";

/**
 * typed-host-configs G2 (2.2): each fixture host runs the whole pipeline
 * (load → declared validation → resolve against CANNED outputs → resolved
 * validation; nothing launches) and is pinned as a JSON `expectHost`
 * expectation; one negative fixture per 2.1 invariant. `_packages/` MIRRORS
 * the real runner/plugin contracts (host-core cannot depend on them) and is
 * type-checked against the live schema API. `scaffold/` holds oxfmt-formatted
 * copies of `buildHostsTemplates("my-project")` (codegen hosts.ts) and its
 * powerhouse.config.json: refresh them when the template changes.
 */

// `$map` landed with T4-A, so the `$map` rows run. The guard test below
// fails if the resolver ever stops accepting `$map`.
const MAP_PENDING = false;

const CONNECT_RUNNER = "@powerhousedao/ph-cli/runners/connect";

afterAll(cleanupProjects);

/** A producer's canned outputs, checked against its outputsSchema (as the
 * compound checks a started member's handle). */
function cannedOutputs(
  canned: Canned,
  folder: string,
  runner: RunnerModule,
  spec: string,
): { ok: true; outputs: unknown } | { ok: false; message: string } {
  if (!Object.hasOwn(canned, folder)) {
    return {
      ok: false,
      message: `host "${folder}" reported no outputs (no canned outputs).`,
    };
  }
  const outputs = canned[folder];
  const schema = runner.outputsSchema as
    | { safeParse(value: unknown): { success: boolean } }
    | undefined;
  if (schema && !schema.safeParse(outputs).success) {
    throw new Error(
      `canned outputs of "${folder}" fail the outputsSchema of ${spec}`,
    );
  }
  return { ok: true, outputs };
}

/* ---------------------------------------------------------------- pipeline */

type ParsedHost = Record<string, unknown> & {
  runner: { plugins?: PluginEntryData[]; [key: string]: unknown };
};
type DraftHost = Record<string, unknown> & HostDefinition;

const resolveEnv = { env: ENV, builtins: BUILTINS };

interface PipelineResult {
  expectation: HostExpectation;
  /** What each verb would receive: the host's own (by name) or each
   * member's (by key), resolved and parsed. */
  resolved: Record<string, ParsedHost>;
}

async function contributionsOf(
  root: string,
  verb: string,
  runnerBlock: { plugins?: PluginEntryData[] },
  file: string,
) {
  const entries = runnerBlock.plugins ?? [];
  if (entries.length === 0) return [];
  return (await resolvePluginContributions(root, verb, entries, file)).drives;
}

/** A member host before its runner validates it: the member's host.js with
 * the wrapper applied (sections are full statements, `runner` key-merges),
 * as compound.ts `memberDraft`. */
async function memberDraft(
  root: string,
  member: ChildWrapper,
): Promise<DraftHost> {
  const base = (await loadHost(root, member.host)).host;
  const reactor = member.reactor ?? base.reactor;
  const config = member.config ?? base.config;
  const draft: Record<string, unknown> = {
    ...base,
    runner: { ...base.runner, ...member.runner },
    ...(config !== undefined ? { config } : {}),
    ...(reactor !== undefined ? { reactor } : {}),
  };
  return draft as DraftHost;
}

/** A reactor host standalone: producers' outputs from the canned set (the
 * stand-in for their live run records). */
async function reactorPipeline(
  root: string,
  canned: Canned,
  host: DraftHost,
  runner: RunnerModule,
  file: string,
): Promise<PipelineResult> {
  const spec = host.runner.module;
  const producers = await loadProducers(
    root,
    outputSitesOf(host).map((site) => site.ref),
  );
  validateDeclaredHost(runner, spec, host, file, {
    outputsSchemaOf: (ref) => {
      const info = producers.get(ref.host);
      if (!info) return { error: `names host "${ref.host}", not loaded.` };
      if ("error" in info) return { error: info.error };
      return runnerOutputsSchema(
        info.runner,
        info.specifier,
        `host "${ref.host}"`,
      );
    },
  });
  const outputs: OutputSource = {
    lookup(ref) {
      const info = producers.get(ref.host);
      if (!info || "error" in info) {
        return { status: "unavailable", message: `"${ref.host}" not loaded` };
      }
      const hit = cannedOutputs(canned, ref.host, info.runner, info.specifier);
      return hit.ok
        ? { status: "available", outputs: hit.outputs }
        : { status: "unavailable", message: `${file}: ${hit.message}` };
    },
  };
  const resolved = resolveHostOutputs(host, {
    outputs,
    ...resolveEnv,
    where: file,
  });
  const parsed = validateHost(runner, spec, resolved, file) as ParsedHost;
  const verb = host.runner.defaultVerb ?? "run";
  const expectation = expectHost({
    kind: "reactor",
    declared: host,
    resolved: parsed,
    contributed: await contributionsOf(root, verb, parsed.runner, file),
  });
  return { expectation, resolved: { [host.name]: parsed } };
}

/** A compound: its own (declared) form, then its members in plan order,
 * each resolved against the canned outputs of the members started before
 * it, as compound.ts `runCompound` (minus the lock, record and verbs). */
async function compoundPipeline(
  root: string,
  canned: Canned,
  host: DraftHost,
  runner: RunnerModule,
  file: string,
): Promise<PipelineResult> {
  const spec = host.runner.module;
  validateDeclaredHost(runner, spec, host, file);
  validateHost(runner, spec, host, file, { tokens: "allow" });
  const children =
    (host as { children?: Record<string, ChildWrapper> }).children ?? {};
  const wiring = (host.config ?? {}) as {
    startOrder?: string[];
    cspRegistrySync?: boolean;
  };
  const prepared = [];
  for (const [key, member] of Object.entries(children)) {
    const draft = await memberDraft(root, member);
    const memberSpec = draft.runner.module;
    prepared.push({
      key,
      member,
      draft,
      spec: memberSpec,
      runner: await resolveRunnerModule(root, memberSpec),
      file: `hosts/${member.host}/host.js`,
    });
  }
  const members = prepared.map((m) => ({ key: m.key, host: m.member.host }));
  const plan = planCompound(
    prepared.map((m) => ({
      key: m.key,
      host: m.member.host,
      refs: outputSitesOf(m.draft).map(({ ref, path: at }) => ({
        ref,
        path: at,
      })),
    })),
    wiring.startOrder,
  );
  const byKey = new Map(prepared.map((m) => [m.key, m]));
  for (const m of prepared) {
    validateDeclaredHost(m.runner, m.spec, m.draft, m.file, {
      outputsSchemaOf: (ref) => {
        const target = memberForRef(ref, members);
        if ("error" in target) return { error: target.error };
        const producer = byKey.get(target.key);
        return producer
          ? runnerOutputsSchema(
              producer.runner,
              producer.spec,
              `member "${target.key}"`,
            )
          : { error: `names member "${target.key}", not prepared.` };
      },
    });
  }

  const verb = host.runner.defaultVerb ?? "run";
  const live = new Map<string, unknown>();
  const source = compoundOutputSource(members, live, host.name);
  const memberInputs: MemberInput[] = [];
  const resolvedMembers: Record<string, ParsedHost> = {};
  for (const key of plan.order) {
    const m = byKey.get(key);
    if (!m) continue;
    const memberVerb =
      verb === "run" ? (m.draft.runner.defaultVerb ?? "run") : verb;
    const oneShot = ONE_SHOT_VERBS.has(memberVerb);
    const resolved: DraftHost = oneShot
      ? { ...m.draft }
      : resolveHostOutputs(m.draft, {
          outputs: source,
          ...resolveEnv,
          where: m.file,
        });
    if (wiring.cspRegistrySync && m.spec === CONNECT_RUNNER) {
      resolved.runner = { ...resolved.runner, cspRegistrySync: true };
    }
    const parsed = validateHost(
      m.runner,
      m.spec,
      resolved,
      m.file,
      oneShot ? { tokens: "allow" } : {},
    ) as ParsedHost;
    resolvedMembers[key] = parsed;
    memberInputs.push({
      key,
      host: m.member.host,
      kind: m.runner.kind,
      declared: m.draft,
      resolved: parsed,
      contributed: await contributionsOf(
        root,
        memberVerb,
        parsed.runner,
        m.file,
      ),
    });
    const hit = cannedOutputs(canned, m.member.host, m.runner, m.spec);
    live.set(key, hit.ok ? hit.outputs : {});
  }
  const expectation = expectHost({
    kind: "compound",
    declared: host,
    members: memberInputs,
    plan,
  });
  return { expectation, resolved: resolvedMembers };
}

/** The whole pipeline for one fixture host; starts nothing. */
async function pipeline(
  projectName: string,
  folder: string,
): Promise<PipelineResult> {
  const root = project(projectName);
  const canned = CANNED[projectName] ?? {};
  const file = `hosts/${folder}/host.js`;
  const host = (await loadHost(root, folder)).host as DraftHost;
  const runner = await resolveRunnerModule(root, host.runner.module);
  return runner.kind === "reactor"
    ? reactorPipeline(root, canned, host, runner, file)
    : compoundPipeline(root, canned, host, runner, file);
}

/* ------------------------------------------------------ expectation helpers */

type Expected = Omit<HostExpectation, "members"> & {
  members?: Record<string, MemberExpectation>;
};

const tokenFree = { dependsOn: [], consumes: [], env: [] };

function reactor(
  e: Partial<HostExpectation> & Pick<HostExpectation, "name">,
): Expected {
  return {
    kind: "reactor",
    verb: "run",
    ...tokenFree,
    multiReactor: false,
    ...e,
  };
}

function compound(
  name: string,
  e: Pick<HostExpectation, "startOrder"> &
    Partial<HostExpectation> & { members: Record<string, MemberExpectation> },
): Expected {
  return { name, kind: "compound", verb: "run", ...tokenFree, ...e };
}

function member(
  host: string,
  e: Expected,
  after: string[] = [],
): MemberExpectation {
  return { host, ...e, after };
}

const local = (
  slug: string,
  extra: Partial<ExpectedDrive> = {},
): ExpectedDrive => ({ slug, kind: "local", source: "host", ...extra });
const remote = (slug: string, url: string): ExpectedDrive => ({
  slug,
  kind: "remote",
  source: "host",
  url,
});
/** The drive the switchboard workflows plugin contributes. */
const workflowsDrive: ExpectedDrive = {
  slug: "workflows",
  kind: "local",
  source: "switchboard-workflows",
  projectHash: "id",
};
const reads = (
  at: string,
  host: string,
  outputPath: (string | number)[],
  memberKey?: string,
): ConsumedOutput => ({
  at,
  host,
  ...(memberKey ? { member: memberKey } : {}),
  path: outputPath,
});
const driveUrl = (at: string, slug: string, host = "switchboard") =>
  reads(at, host, ["drives", slug, "url"]);

/* ---------------------------------------------------------------- scaffold */

const SCAFFOLD_SB = "http://127.0.0.1:7491";
const scaffoldSwitchboard = reactor({
  name: "my-project-switchboard",
  drives: [workflowsDrive, local("powerhouse")],
});
/** Every drive the scaffold switchboard reports (declared `powerhouse`,
 * plugin-created `workflows`), attached by URL through `$map`, key-sorted. */
const scaffoldDrivesAsRemotes = [
  remote("powerhouse", `${SCAFFOLD_SB}/d/powerhouse`),
  remote("workflows", `${SCAFFOLD_SB}/d/workflows`),
];
const scaffoldConnect = reactor({
  name: "my-project-connect",
  clientMode: "worker",
  backends: [{ name: "main", kind: "worker" }],
  remotes: [],
  drives: [local("powerhouse")],
});

/* ------------------------------------------------------------------ matrix */

const LAB = "http://127.0.0.1:4001";
const labSwitchboard = reactor({
  name: "lab-switchboard",
  env: ["FIXTURE_DATA_DIR"],
  clientMode: "in-process",
  backends: [
    {
      name: "main",
      kind: "in-process",
      storage: "path",
      dataDir: "/fixture/data",
    },
  ],
  remotes: [],
  drives: [
    workflowsDrive,
    local("lab"),
    local("vetra", { projectHash: true }),
    local("shared", { projectHash: "id" }),
  ],
});
const POSTGRES_ONLY_SERVER =
  'Backend "main": storage kind "postgres" is server-side only — a provisioned (in-process/worker) reactor cannot use it. Point a "remote" backend at the switchboard that owns that database instead.';
const labUi = reactor({
  name: "lab-ui",
  dependsOn: ["switchboard"],
  consumes: [driveUrl("reactor.backends.sb.remote.url", "lab")],
  clientMode: "remote",
  backends: [{ name: "sb", kind: "remote" }],
  remotes: [`${LAB}/d/lab`],
  drives: [],
});
/** Every drive the lab switchboard reports, attached by URL, key-sorted. */
const labDrivesAsRemotes = [
  remote("lab", `${LAB}/d/lab`),
  remote("shared", `${LAB}/d/shared`),
  remote("vetra", `${LAB}/d/vetra-0f1e2d3c`),
  remote("workflows", `${LAB}/d/workflows`),
];

interface Row {
  project: "scaffold" | "matrix";
  host: string;
  /** The 2.2 cells this row covers. */
  cells: string;
  expected: Expected;
  /** Uses `$map`: runs once T4-A lands (MAP_PENDING). */
  map?: true;
}

const ROWS: Row[] = [
  {
    project: "scaffold",
    host: "switchboard",
    cells: "switchboard runner · standalone · no backends · plugin drive",
    expected: scaffoldSwitchboard,
  },
  {
    project: "scaffold",
    host: "connect",
    cells: "connect runner · worker client · local drive",
    expected: scaffoldConnect,
  },
  {
    project: "scaffold",
    host: "assistant",
    cells: "mastra runner · remote client · $output",
    expected: reactor({
      name: "my-project-assistant",
      dependsOn: ["switchboard"],
      consumes: [
        driveUrl("reactor.backends.switchboard.remote.url", "powerhouse"),
      ],
      clientMode: "remote",
      backends: [{ name: "switchboard", kind: "remote" }],
      remotes: [`${SCAFFOLD_SB}/d/powerhouse`],
      drives: [],
    }),
  },
  {
    project: "scaffold",
    host: "cli",
    cells:
      "generic compound · remote-client member · $map over every switchboard drive (incl. plugin-created) · protocol restored",
    expected: compound("cli", {
      startOrder: ["cli-switchboard", "cli-connect"],
      members: {
        "cli-switchboard": member("switchboard", scaffoldSwitchboard),
        "cli-connect": member(
          "connect",
          reactor({
            name: "my-project-connect",
            dependsOn: ["switchboard"],
            consumes: [
              reads("runner.plugins[1].config.drive", "switchboard", [
                "drives",
                "workflows",
                "url",
              ]),
              driveUrl("reactor.backends.sb.remote.url", "powerhouse"),
              reads("reactor.drives.$map.over", "switchboard", ["drives"]),
            ],
            clientMode: "remote",
            backends: [{ name: "sb", kind: "remote" }],
            remotes: [`${SCAFFOLD_SB}/d/powerhouse`],
            drives: scaffoldDrivesAsRemotes,
          }),
          ["cli-switchboard"],
        ),
      },
    }),
  },
  {
    project: "scaffold",
    host: "desktop",
    cells:
      "desktop runner · path + ${userData} · member at serve · $map remote drives",
    expected: compound("desktop", {
      startOrder: ["desktop-switchboard", "desktop-connect"],
      members: {
        "desktop-switchboard": member(
          "switchboard",
          reactor({
            name: "my-project-switchboard",
            clientMode: "in-process",
            backends: [
              {
                name: "main",
                kind: "in-process",
                storage: "path",
                dataDir: "/fixture/user-data/.ph/reactor-storage",
              },
            ],
            remotes: [],
            drives: [workflowsDrive, local("powerhouse")],
          }),
        ),
        "desktop-connect": member(
          "connect",
          reactor({
            ...scaffoldConnect,
            verb: "serve",
            dependsOn: ["switchboard"],
            consumes: [
              reads("runner.plugins[1].config.drive", "switchboard", [
                "drives",
                "workflows",
                "url",
              ]),
              reads("reactor.drives.$map.over", "switchboard", ["drives"]),
            ],
            drives: scaffoldDrivesAsRemotes,
          }),
          ["desktop-switchboard"],
        ),
      },
    }),
  },
  {
    project: "scaffold",
    host: "vetra",
    cells: "compound at dev · projectHash: true · verb-scoped plugins",
    expected: compound("vetra", {
      verb: "dev",
      startOrder: ["vetra-switchboard", "vetra-studio"],
      members: {
        "vetra-switchboard": member(
          "switchboard",
          reactor({
            name: "my-project-switchboard",
            verb: "dev",
            drives: [
              workflowsDrive,
              local("powerhouse"),
              local("vetra", { projectHash: true }),
              local("vetra-preview", { projectHash: true }),
            ],
          }),
        ),
        "vetra-studio": member(
          "connect",
          reactor({
            ...scaffoldConnect,
            verb: "dev",
            dependsOn: ["switchboard"],
            consumes: [
              reads("runner.plugins[2].config.drive", "switchboard", [
                "drives",
                "workflows",
                "url",
              ]),
            ],
          }),
          ["vetra-switchboard"],
        ),
      },
    }),
  },
  {
    project: "matrix",
    host: "switchboard",
    cells:
      '$env storage dir · projectHash true / "id" · plugin-contributed drive',
    expected: labSwitchboard,
  },
  {
    project: "matrix",
    host: "switchboard-postgres",
    cells: "postgres on a server backend (accepted) · verb serve",
    expected: reactor({
      name: "lab-switchboard-pg",
      verb: "serve",
      clientMode: "in-process",
      backends: [
        {
          name: "main",
          kind: "in-process",
          storage: "postgres",
          provisionError: POSTGRES_ONLY_SERVER,
        },
      ],
      remotes: [],
      drives: [],
    }),
  },
  {
    project: "matrix",
    host: "connect-in-process",
    cells: "in-process client · memory storage · verb dev",
    expected: reactor({
      name: "lab-connect-memory",
      verb: "dev",
      clientMode: "in-process",
      backends: [{ name: "main", kind: "in-process", storage: "memory" }],
      remotes: [],
      drives: [local("scratch")],
    }),
  },
  {
    project: "matrix",
    host: "connect-worker-idb",
    cells: "worker client · idb storage",
    expected: reactor({
      name: "lab-connect-worker",
      clientMode: "worker",
      backends: [{ name: "main", kind: "worker", storage: "idb" }],
      remotes: [],
      drives: [local("notes")],
    }),
  },
  {
    project: "matrix",
    host: "connect-router",
    cells: "router client (multi-reactor) · remote drive by token and by URL",
    expected: reactor({
      name: "lab-connect-router",
      dependsOn: ["switchboard"],
      consumes: [
        driveUrl("reactor.backends.sb.remote.url", "lab"),
        reads("reactor.drives[0].remote.url", "switchboard", [
          "drives",
          "lab",
          "url",
        ]),
      ],
      clientMode: "router",
      multiReactor: true,
      // placement.primary first
      backends: [
        { name: "tab", kind: "in-process", storage: "idb" },
        { name: "sb", kind: "remote" },
      ],
      remotes: [`${LAB}/d/lab`],
      drives: [
        remote("lab", `${LAB}/d/lab`),
        remote("public", "https://drives.example.com/d/public"),
      ],
    }),
  },
  {
    project: "matrix",
    host: "connect-remote",
    cells: "remote client · $concat · projectHash drive by URL",
    expected: reactor({
      name: "lab-connect-remote",
      dependsOn: ["switchboard"],
      consumes: [
        reads("runner.plugins[0].config.drive", "switchboard", [
          "drives",
          "workflows",
          "url",
        ]),
        reads("reactor.backends.sb.remote.url.$concat[0]", "switchboard", [
          "origin",
        ]),
        reads("reactor.drives[0].remote.url", "switchboard", [
          "drives",
          "vetra",
          "url",
        ]),
      ],
      clientMode: "remote",
      backends: [{ name: "sb", kind: "remote" }],
      remotes: [`${LAB}/d/lab`],
      drives: [remote("vetra", `${LAB}/d/vetra-0f1e2d3c`)],
    }),
  },
  {
    project: "matrix",
    host: "connect-postgres",
    cells: "postgres on a provisioned backend (rejected by provisioning)",
    expected: reactor({
      name: "lab-connect-pg",
      clientMode: "in-process",
      backends: [
        {
          name: "main",
          kind: "in-process",
          storage: "postgres",
          provisionError: POSTGRES_ONLY_SERVER,
        },
      ],
      remotes: [],
      drives: [],
    }),
  },
  {
    project: "matrix",
    host: "assistant",
    cells: "mastra · required $env (set) · verb serve",
    expected: reactor({
      name: "lab-assistant",
      verb: "serve",
      dependsOn: ["switchboard"],
      consumes: [driveUrl("reactor.backends.switchboard.remote.url", "lab")],
      env: ["FIXTURE_API_KEY"],
      clientMode: "remote",
      backends: [{ name: "switchboard", kind: "remote" }],
      remotes: [`${LAB}/d/lab`],
      drives: [],
    }),
  },
  {
    project: "matrix",
    host: "assistant-keyless",
    cells: "optional $env (unset: property omitted)",
    expected: reactor({
      name: "lab-assistant-keyless",
      dependsOn: ["switchboard"],
      consumes: [driveUrl("reactor.backends.switchboard.remote.url", "lab")],
      env: ["FIXTURE_UNSET_KEY"],
      clientMode: "remote",
      backends: [{ name: "switchboard", kind: "remote" }],
      remotes: [`${LAB}/d/lab`],
      drives: [],
    }),
  },
  {
    project: "matrix",
    host: "ui",
    cells: "a connect host in a folder not named connect, standalone",
    expected: labUi,
  },
  {
    project: "matrix",
    host: "studio",
    cells:
      "two members of one host (`member`) · plan from tokens · roles by runner",
    expected: compound("lab-studio", {
      startOrder: ["sb-a", "sb-b", "ui"],
      members: {
        "sb-a": member("switchboard", labSwitchboard),
        "sb-b": member("switchboard", labSwitchboard),
        ui: member(
          "ui",
          {
            ...labUi,
            dependsOn: ["switchboard#sb-b"],
            consumes: [
              reads(
                "reactor.backends.sb.remote.url",
                "switchboard",
                ["drives", "lab", "url"],
                "sb-b",
              ),
            ],
          },
          ["sb-b"],
        ),
      },
    }),
  },
  {
    project: "matrix",
    host: "cli-map",
    cells:
      "3.4 cli: $map over every switchboard drive (incl. plugin-created), key-sorted",
    map: true,
    expected: compound("lab-cli", {
      startOrder: ["cli-switchboard", "cli-connect"],
      members: {
        "cli-switchboard": member("switchboard", labSwitchboard),
        "cli-connect": member(
          "ui",
          {
            ...labUi,
            consumes: [
              driveUrl("reactor.backends.sb.remote.url", "lab"),
              reads("reactor.drives.$map.over", "switchboard", ["drives"]),
            ],
            drives: labDrivesAsRemotes,
          },
          ["cli-switchboard"],
        ),
      },
    }),
  },
  {
    project: "matrix",
    host: "desktop-map",
    cells: "desktop runner · router member at serve · $map remote drives",
    map: true,
    expected: compound("lab-desktop", {
      startOrder: ["desktop-switchboard", "desktop-connect"],
      members: {
        "desktop-switchboard": member("switchboard", labSwitchboard),
        "desktop-connect": member(
          "connect-worker-idb",
          reactor({
            name: "lab-connect-worker",
            verb: "serve",
            dependsOn: ["switchboard"],
            consumes: [
              driveUrl("reactor.backends.sb.remote.url", "lab"),
              reads("reactor.drives.$map.over", "switchboard", ["drives"]),
            ],
            clientMode: "router",
            multiReactor: true,
            backends: [
              { name: "main", kind: "worker", storage: "idb" },
              { name: "sb", kind: "remote" },
            ],
            remotes: [`${LAB}/d/lab`],
            drives: labDrivesAsRemotes,
          }),
          ["desktop-switchboard"],
        ),
      },
    }),
  },
];

describe("host fixtures: the full pipeline per topology cell (2.2)", () => {
  it("MAP_PENDING matches the resolver (flip it when $map lands)", () => {
    const issues = checkTokenSites({
      reactor: {
        drives: {
          $map: {
            over: { $output: { host: "switchboard", path: ["drives"] } },
            to: { slug: { $key: true } },
          },
        },
      },
    });
    const unsupported = issues.some((i) =>
      i.message.includes("not supported yet"),
    );
    expect(unsupported).toBe(MAP_PENDING);
  });

  const runRow = async (_label: string, row: Row) => {
    const { expectation } = await pipeline(row.project, row.host);
    // JSON-only: survives a round trip unchanged (no undefined, Map, …).
    expect(JSON.parse(JSON.stringify(expectation))).toStrictEqual(expectation);
    expect(expectation).toStrictEqual(row.expected);
  };
  const labelled = (rows: Row[]) =>
    rows.map((row) => [`${row.project}/${row.host}`, row] as const);
  it.each(labelled(ROWS.filter((row) => !row.map)))("%s", runRow);
  it.skipIf(MAP_PENDING).each(labelled(ROWS.filter((row) => row.map)))(
    "%s ($map)",
    runRow,
  );

  it("covers every fixture host of the scaffold and the matrix", () => {
    for (const projectName of ["scaffold", "matrix"] as const) {
      const listed = ROWS.filter((r) => r.project === projectName)
        .map((r) => r.host)
        .sort();
      expect(listed).toEqual(
        readdirSync(path.join(FIXTURES, projectName, "hosts")).sort(),
      );
    }
  });

  it("verbs receive resolved values: $env, ${userData}, optional omission", async () => {
    const assistant = await pipeline("matrix", "assistant");
    expect(assistant.resolved["lab-assistant"].config).toEqual({
      model: "openrouter/fixture/model",
      apiKey: "sk-fixture",
    });
    const keyless = await pipeline("matrix", "assistant-keyless");
    expect(keyless.resolved["lab-assistant-keyless"].config).toEqual({});
    const remoteClient = await pipeline("matrix", "connect-remote");
    expect(remoteClient.resolved["lab-connect-remote"].runner.plugins).toEqual([
      {
        module: "@powerhousedao/connect/plugins/workflows",
        config: { drive: `${LAB}/d/workflows` },
      },
    ]);
  });

  it("member roles come from the runner: cspRegistrySync reaches the connect-runner member only", async () => {
    const studio = await pipeline("matrix", "studio");
    expect(studio.resolved.ui.runner).toMatchObject({ cspRegistrySync: true });
    for (const key of ["sb-a", "sb-b"]) {
      expect(studio.resolved[key].runner).not.toHaveProperty("cspRegistrySync");
    }
    // The wrapper's runner key-merges: sb-b's port, sb-a's own.
    expect(studio.resolved["sb-a"].runner.port).toBe(4001);
    expect(studio.resolved["sb-b"].runner.port).toBe(4002);
  });

  it.skipIf(MAP_PENDING)(
    "3.4 cli: the protocol is restored next to the remote backend",
    async () => {
      const cli = await pipeline("matrix", "cli-map");
      expect(cli.resolved["cli-connect"].reactor).toMatchObject({
        protocol: { createSignaturePolicy: "v2-required" },
      });
      // the scaffold cli does the same (from powerhouse.config.json)
      const scaffoldCli = await pipeline("scaffold", "cli");
      expect(scaffoldCli.resolved["cli-connect"].reactor).toMatchObject({
        protocol: { createSignaturePolicy: "v2-required" },
      });
    },
  );
});

describe("expectHost drive plan", () => {
  it("merges by SERVED slug: a projectHash: true drive never replaces a plain one", () => {
    const contributed = [
      {
        declaration: { slug: "workflows", projectHash: "id" },
        source: "switchboard-workflows",
      },
    ];
    const plan = (drives: Record<string, unknown>[]) =>
      expectHost({
        kind: "reactor",
        declared: { name: "x", runner: { module: "m" }, reactor: { drives } },
        contributed,
      }).drives;
    // Same served slug: the host replaces the contribution in place.
    expect(plan([{ slug: "workflows", name: "Mine" }])).toEqual([
      local("workflows"),
    ]);
    // Served as workflows-<hash>: both drives exist (mergeDrivePlan).
    expect(plan([{ slug: "workflows", projectHash: true }])).toEqual([
      workflowsDrive,
      local("workflows", { projectHash: true }),
    ]);
  });
});

/* --------------------------------------------------------------- negatives */

interface Negative {
  host: string;
  /** The 2.1 (or 3.2/3.5) invariant this fixture breaks. */
  invariant: string;
  /** The error, including the host path it names. */
  error: RegExp;
}

const NEGATIVES: Negative[] = [
  {
    host: "xor-reactor-with-children",
    invariant: "reactor XOR children (reactor runner)",
    error:
      /hosts\/xor-reactor-with-children\/host\.js: "@powerhousedao\/ph-cli\/runners\/switchboard" is a reactor runner, so the host must not declare `children`/,
  },
  {
    host: "xor-compound-with-reactor",
    invariant: "reactor XOR children (compound runner)",
    error:
      /hosts\/xor-compound-with-reactor\/host\.js: "@powerhousedao\/host-core\/runners\/compound" is a compound runner, so the host must not declare `reactor`/,
  },
  {
    host: "unknown-top-key",
    invariant: "unknown top-level keys",
    error:
      /hosts\/unknown-top-key\/host\.js failed validation[\s\S]*- <root>: Unrecognized key: "reactr"/,
  },
  {
    host: "unknown-runner-key",
    invariant: "unknown runner keys",
    error:
      /hosts\/unknown-runner-key\/host\.js failed validation[\s\S]*- runner: Unrecognized key: "strictPortt"/,
  },
  {
    host: "start-order-unknown",
    invariant: "startOrder ⊆ children",
    error:
      /- config\.startOrder\.1: startOrder names "nope", which is not a member\. Members: sb\./,
  },
  {
    host: "start-order-contradicts",
    invariant: "startOrder consistent with the output dependencies",
    error:
      /config\.startOrder starts "ui" before "sb", but ui\.reactor\.backends\.sb\.remote\.url consumes "sb"'s outputs/,
  },
  {
    host: "default-verb-unknown",
    invariant: "defaultVerb ⊆ runner verbs",
    error:
      /hosts\/default-verb-unknown\/host\.js: runner\.defaultVerb "start" is not a verb of "@powerhousedao\/ph-cli\/runners\/switchboard"\. Supported verbs: build, dev, run, serve\./,
  },
  {
    host: "plugin-verb-unknown",
    invariant: "plugin verbs[] ⊆ runner verbs",
    error:
      /hosts\/plugin-verb-unknown\/host\.js: plugin "fixture-plugin" is scoped to verb "promptFromMessages", which "@powerhousedao\/clint\/mastra-runner" does not export\. Supported verbs: build, run, serve\./,
  },
  {
    host: "remote-without-url",
    invariant: "a remote backend needs remote.url",
    error:
      /hosts\/remote-without-url\/host\.js failed validation[\s\S]*- reactor\.backends\.sb\.remote\.url: /,
  },
  {
    host: "remote-without-block",
    invariant: "a remote backend needs remote.url (no remote block at all)",
    error:
      /hosts\/remote-without-block\/host\.js failed validation[\s\S]*- reactor\.backends\.sb\.remote\.url: a "remote" backend needs remote\.url, a switchboard drive address: remote: \{ url: switchboard\.drives\.<slug>\.url \}[\s\S]*\$output/,
  },
  {
    host: "undefined-value",
    invariant: "no undefined values (JSON gate)",
    error:
      /hosts\/undefined-value\/host\.js exports a non-static value at `runner\.port \(undefined\)`/,
  },
  {
    host: "token-bad-path",
    invariant: "a token's path is valid against its producer's outputsSchema",
    error:
      /hosts\/token-bad-path\/host\.js: invalid output token:\n {2}- reactor\.drives\[0\]\.remote\.url: \$output switchboard › drives\.workflows\.uri: outputs\.drives\.workflows has no key "uri" \(keys: id, url\)/,
  },
  {
    host: "token-unknown-producer",
    invariant: "a token's producer exists",
    error:
      /hosts\/token-unknown-producer\/host\.js: invalid output token:\n {2}- reactor\.backends\.sb\.remote\.url: names host "switchbaord", which cannot be loaded: Unknown host "switchbaord"/,
  },
  {
    host: "token-cycle",
    invariant: "no token cycle",
    error:
      /output tokens form a cycle between "ping", "pong": ping \(reactor\.drives\[0\]\.remote\.url\) needs pong; pong \(reactor\.drives\[0\]\.remote\.url\) needs ping\./,
  },
  {
    host: "stale-outputs",
    invariant: "a generated outputs.js matches its producer",
    error:
      /hosts\/switchboard\/outputs\.js is stale \(its producer's outputsSchema or declared drives changed since it was generated\); run `ph generate hosts`\./,
  },
  {
    host: "process-env",
    invariant: "no process.env in host files",
    error:
      /hosts\/process-env\/host\.js:5 reads `process\.`[\s\S]*Use an \$env token instead/,
  },
  {
    host: "removed-from-slug",
    invariant: "no old cross-host forms ({ from, slug })",
    error:
      /hosts\/removed-from-slug\/host\.js: removed form:\n {2}- runner\.plugins\[0\]\.config\.drive: drive: \{ from, slug \} was removed; use switchboard\.drives\.workflows\.url/,
  },
  {
    host: "removed-remote-host",
    invariant: "no old cross-host forms (remote.host)",
    error:
      /hosts\/removed-remote-host\/host\.js: removed form:\n {2}- reactor\.backends\.switchboard\.remote\.host: remote: \{ host \} was removed; use a drive address: remote: \{ url: switchboard\.drives\.<slug>\.url \}/,
  },
  {
    host: "remote-graphql-url",
    invariant: "a remote link is a switchboard drive address",
    error:
      /hosts\/remote-graphql-url\/host\.js failed validation[\s\S]*- reactor\.backends\.sb\.remote\.url: remote\.url reads switchboard's endpoints\.graphql; it must be a switchboard drive address[\s\S]*path: \["drives", "<slug>", "url"\]/,
  },
  {
    host: "backend-kind-missing",
    invariant: "backend kind present",
    error:
      /hosts\/backend-kind-missing\/host\.js failed validation[\s\S]*- reactor\.backends\.main\.kind: Invalid option: expected one of "in-process"\|"worker"\|"remote"/,
  },
  {
    host: "member-role-by-folder",
    invariant: "member roles: no folder-keyed wiring",
    error:
      /hosts\/member-role-by-folder\/host\.js: removed form:\n {2}- config\.projectDrivesIntoConnect: config\.projectDrivesIntoConnect was removed; declare the drives on the member that consumes them, by output token/,
  },
  {
    host: "env-unset",
    invariant: "3.2 an unset $env fails, naming it",
    error:
      /hosts\/env-unset\/host\.js: `config\.apiKey` reads \$env FIXTURE_NEVER_SET, which is not set\./,
  },
  {
    host: "env-optional-misplaced",
    invariant: "3.2 optional $env only as a property value",
    error:
      /hosts\/env-optional-misplaced\/host\.js: invalid output token:\n {2}- config\.apiKey\.\$concat\[1\]: \{ \$env: \{ name, optional: true \} \} is legal only as the direct value of an object property/,
  },
  {
    host: "token-in-plain-field",
    invariant: "3.5 tokens only in token-able fields",
    error:
      /hosts\/token-in-plain-field\/host\.js failed validation[\s\S]*- runner\.host: this field does not take an output token/,
  },
];

describe("host fixtures: one negative per invariant (2.1)", () => {
  it.each(NEGATIVES.map((n) => [n.invariant, n] as const))(
    "%s",
    async (_label, negative) => {
      await expect(pipeline("invariants", negative.host)).rejects.toThrow(
        negative.error,
      );
    },
  );

  it("lists every negative fixture (the producers aside)", () => {
    const producers = ["switchboard", "connect", "ping", "pong"];
    expect(NEGATIVES.map((n) => n.host).sort()).toEqual(
      readdirSync(path.join(FIXTURES, "invariants", "hosts"))
        .filter((name) => !producers.includes(name))
        .sort(),
    );
  });
});
