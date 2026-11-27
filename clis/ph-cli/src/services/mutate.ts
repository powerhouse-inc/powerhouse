import { isPidAlive, listRunRecords } from "@powerhousedao/host-core";
import type { PropagationMode } from "@powerhousedao/reactor";
import type { GraphQLReactorClient } from "@powerhousedao/reactor-browser/graphql-client";
import { identityDataDir } from "@powerhousedao/shared/clis/identity";
import { UNSIGNED_WRITE_ERROR_CODE } from "@powerhousedao/shared/clis/unsigned-writes";
import type {
  Action,
  DocumentModelModule,
  PHDocument,
} from "@powerhousedao/shared/document-model";
import type { OpenSession } from "@renown/sdk/identity";
import fs from "node:fs";
import path from "node:path";
import { readVetraRuntime } from "../utils/vetra-runtime.js";
import { configPackageModels, findProjectDir } from "./project-models.js";

/**
 * `ph mutate`: a change to a document on a switchboard, signed as the person
 * (the key in PH_IDENTITY_KEY, else their Renown login, else their pseudonym:
 * outside a project the identity home's) through
 * ph-cli's own session, so the switchboard signs nothing for the caller
 * (Powerhouse 6.4). Four forms: one action (`<document> <TYPE> --input`), a
 * file of plain actions (`<document> --actions`), a create (`--create`, built
 * and filed here as every Powerhouse client builds one) and a delete
 * (`--delete`, the signed DELETE_DOCUMENT the switchboard completes). Actions
 * are plain objects: no document model is needed but for a create.
 */

type Env = Readonly<Record<string, string | undefined>>;

export type MutateArgs = {
  document?: string;
  type?: string;
  input?: string;
  inputFile?: string;
  scope?: string;
  branch?: string;
  actions?: string;
  create?: string;
  parent?: string;
  name?: string;
  delete?: string;
  cascade?: boolean;
  url?: string;
  json?: boolean;
};

export type MutateIo = {
  /** stdout: what was written, or JSON. */
  out: (line: string) => void;
  /** stderr: refusals and what went wrong. */
  err: (line: string) => void;
  env: Env;
  cwd: string;
  /** Whether a pseudonym's password may be asked. */
  interactive: boolean;
};

export function defaultMutateIo(): MutateIo {
  return {
    out: (line) => console.log(line),
    err: (line) => console.error(line),
    env: process.env,
    cwd: process.env.PH_CALLER_CWD ?? process.cwd(),
    interactive: process.stdin.isTTY,
  };
}

/** The session ph-cli signs with, as `ph token` names it. */
export const MUTATE_SESSION_LABEL = "ph-cli";

const USAGE =
  "Name what to change: `ph mutate <document> <TYPE> [--input <json>]`, " +
  "`ph mutate <document> --actions <file.json>`, " +
  "`ph mutate --create <type> [--parent <drive>] [--name <name>]` or " +
  "`ph mutate --delete <document> [--cascade]`.";

/** What the person reads; the command exits 1. */
class MutateError extends Error {}

type Plan =
  | {
      kind: "actions";
      document: string;
      branch: string;
      actions: Action[];
    }
  | { kind: "create"; documentType: string; parent?: string; name?: string }
  | { kind: "delete"; document: string; cascade: boolean };

function refuseWith(
  args: MutateArgs,
  form: string,
  flags: (keyof MutateArgs)[],
): void {
  const given = flags.filter((flag) => args[flag] !== undefined);
  if (given.length === 0) return;
  const names = given.map((flag) =>
    flag === "document" || flag === "type"
      ? `<${flag}>`
      : `--${flag.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`,
  );
  throw new MutateError(`${form} takes no ${names.join(", ")}. ${USAGE}`);
}

function readJson(file: string, what: string): unknown {
  let text: string;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch (error) {
    throw new MutateError(
      `${what}: cannot read ${file}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  return parseJson(text, `${what} (${file})`);
}

function parseJson(text: string, what: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new MutateError(
      `${what} is no JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/** A plain action: its type, input and scope; id and timestamp made here unless given. */
function actionOf(value: unknown, where: string, makeId: () => string): Action {
  const given = value as Partial<Record<keyof Action, unknown>> | null;
  if (
    !given ||
    typeof given !== "object" ||
    typeof given.type !== "string" ||
    given.type === ""
  ) {
    throw new MutateError(`${where} is no action: it needs a "type".`);
  }
  if (given.scope !== undefined && typeof given.scope !== "string") {
    throw new MutateError(`${where}: "scope" is a string.`);
  }
  return {
    id: typeof given.id === "string" && given.id ? given.id : makeId(),
    type: given.type,
    scope: (given.scope as string | undefined) ?? "global",
    timestampUtcMs:
      typeof given.timestampUtcMs === "string" && given.timestampUtcMs
        ? given.timestampUtcMs
        : new Date().toISOString(),
    input: given.input ?? {},
  };
}

/** What the arguments ask for, or the refusal that names the forms. */
export function mutatePlan(
  args: MutateArgs,
  o: { cwd: string; makeId: () => string },
): Plan {
  const branch = args.branch ?? "main";
  if (args.create !== undefined) {
    refuseWith(args, "--create", [
      "document",
      "type",
      "input",
      "inputFile",
      "scope",
      "branch",
      "actions",
      "delete",
      "cascade",
    ]);
    if (args.create === "") throw new MutateError(`--create names a type.`);
    return {
      kind: "create",
      documentType: args.create,
      ...(args.parent ? { parent: args.parent } : {}),
      ...(args.name !== undefined ? { name: args.name } : {}),
    };
  }
  if (args.delete !== undefined) {
    refuseWith(args, "--delete", [
      "document",
      "type",
      "input",
      "inputFile",
      "scope",
      "branch",
      "actions",
      "parent",
      "name",
    ]);
    if (args.delete === "") throw new MutateError(`--delete names a document.`);
    return {
      kind: "delete",
      document: args.delete,
      cascade: Boolean(args.cascade),
    };
  }
  if (args.document === undefined) throw new MutateError(USAGE);
  refuseWith(args, "A change to a document", ["parent", "name", "cascade"]);
  if (args.actions !== undefined) {
    refuseWith(args, "--actions", ["type", "input", "inputFile", "scope"]);
    const file = path.resolve(o.cwd, args.actions);
    const read = readJson(file, "--actions");
    const list = Array.isArray(read)
      ? (read as unknown[])
      : (read as { actions?: unknown } | null)?.actions;
    if (!Array.isArray(list) || list.length === 0) {
      throw new MutateError(
        `--actions (${file}) holds no actions: an array of { type, input, scope }.`,
      );
    }
    return {
      kind: "actions",
      document: args.document,
      branch,
      actions: list.map((value, index) =>
        actionOf(value, `--actions (${file}) entry ${index}`, o.makeId),
      ),
    };
  }
  if (args.type === undefined || args.type === "") {
    throw new MutateError(
      `Name the action's type after the document, or send a file with --actions. ${USAGE}`,
    );
  }
  if (args.input !== undefined && args.inputFile !== undefined) {
    throw new MutateError("Give the input once: --input or --input-file.");
  }
  const input =
    args.input !== undefined
      ? parseJson(args.input, "--input")
      : args.inputFile !== undefined
        ? readJson(path.resolve(o.cwd, args.inputFile), "--input-file")
        : {};
  return {
    kind: "actions",
    document: args.document,
    branch,
    actions: [
      actionOf(
        { type: args.type, input, scope: args.scope },
        "The action",
        o.makeId,
      ),
    ],
  };
}

// ------------------------------------------------------------ the host

type Endpoint = { graphql: string; base: string };

/** A switchboard URL as given: its GraphQL endpoint, or the base it serves it under. */
export function switchboardEndpoint(url: string): Endpoint {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new MutateError(`${url} is no URL.`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new MutateError(`${url} is no http(s) URL.`);
  }
  const trimmed = parsed.pathname.replace(/\/+$/, "");
  const base = trimmed.endsWith("/graphql")
    ? trimmed.slice(0, -"/graphql".length)
    : trimmed;
  return {
    graphql: `${parsed.origin}${base}/graphql`,
    base: `${parsed.origin}${base}`,
  };
}

/** The GraphQL endpoints the project's running hosts publish. */
export function runningSwitchboards(projectDir: string, env: Env): string[] {
  const found = new Set<string>();
  const add = (value: unknown) => {
    const graphql = (value as { endpoints?: { graphql?: unknown } } | undefined)
      ?.endpoints?.graphql;
    if (typeof graphql === "string" && graphql) found.add(graphql);
  };
  for (const record of listRunRecords(projectDir, env)) {
    if (!isPidAlive(record.pid)) continue;
    add(record.outputs);
    for (const member of Object.values(record.members ?? {})) {
      add(member.outputs);
    }
  }
  const vetra = readVetraRuntime(projectDir);
  if (vetra?.switchboardUrl && isPidAlive(vetra.pid)) {
    found.add(vetra.switchboardUrl);
  }
  return [...found];
}

function hostOf(args: MutateArgs, projectDir: string, env: Env): Endpoint {
  if (args.url !== undefined) return switchboardEndpoint(args.url);
  const running = runningSwitchboards(projectDir, env);
  if (running.length === 1) return switchboardEndpoint(running[0]);
  if (running.length === 0) {
    throw new MutateError(
      `No switchboard of the project at ${projectDir} is running (it has no live run record): start one (\`ph dev\`), or name one with --url.`,
    );
  }
  throw new MutateError(
    `The project at ${projectDir} runs ${running.length} switchboards (${running.join(", ")}): name one with --url.`,
  );
}

// ------------------------------------------------------------ refusals

type Refusal = { code?: string; reason?: string; message: string };

/** The GraphQL errors a request was answered with, through any wrapping. */
export function refusalsOf(error: unknown): Refusal[] {
  for (
    let current: unknown = error;
    current;
    current = (current as { cause?: unknown }).cause
  ) {
    const errors = (current as { response?: { errors?: unknown } }).response
      ?.errors;
    if (Array.isArray(errors) && errors.length > 0) {
      return errors.map((entry) => {
        const e = entry as {
          message?: unknown;
          extensions?: { code?: unknown; reason?: unknown };
        };
        return {
          ...(typeof e.extensions?.code === "string"
            ? { code: e.extensions.code }
            : {}),
          ...(typeof e.extensions?.reason === "string"
            ? { reason: e.extensions.reason }
            : {}),
          message: typeof e.message === "string" ? e.message : String(entry),
        };
      });
    }
  }
  return [];
}

/** How a refusal reads: the server's code (and reason), then its text with the fix. */
export function describeRefusal(refusal: Refusal): string {
  if (!refusal.code) return `Failed: ${refusal.message}`;
  const code =
    refusal.code === UNSIGNED_WRITE_ERROR_CODE && refusal.reason
      ? `${refusal.code}, ${refusal.reason}`
      : refusal.code;
  return `Refused (${code}): ${refusal.message}`;
}

// ------------------------------------------------------------ running

type Signed = {
  address: string;
  session: string;
  key: string;
  /** How the person reads who signed. */
  as: string;
};

function signedAs(session: OpenSession): Signed {
  return {
    address: session.signer.user.address,
    session: session.signer.app.name,
    key: session.signer.app.key,
    as: `session "${session.signer.app.name}" for ${session.identity.label}`,
  };
}

type Models = {
  current(): readonly DocumentModelModule[];
  close(): Promise<void>;
};

/** The models a create builds with: the base ones, the project's and its packages'. */
async function modelsOf(
  projectDir: string | undefined,
  io: MutateIo,
): Promise<Models> {
  const remote = await import("@powerhousedao/reactor-mcp/remote");
  if (!projectDir) {
    return {
      current: () => remote.baseDocumentModels,
      close: () => Promise.resolve(),
    };
  }
  const local = await remote.localDocumentModels(projectDir, {
    onError: (error) =>
      io.err(
        `The project's document models did not load: ${error instanceof Error ? error.message : String(error)}`,
      ),
  });
  const packaged = await configPackageModels(projectDir, (name, error) =>
    io.err(
      `The document models of ${name} did not load: ${error instanceof Error ? error.message : String(error)}`,
    ),
  );
  return {
    current: () => [...local.current(), ...packaged],
    close: () => local.close(),
  };
}

const typesOf = (actions: readonly Action[]) => [
  ...new Set(actions.map((action) => action.type)),
];

type PlannedJob = {
  key: string;
  documentId: string;
  scope: string;
  branch: string;
  actions: Action[];
  dependsOn: string[];
  /** The entries of the `--actions` file it sends, first and last (0-based). */
  entries: [number, number];
};

/** One job per run of actions in one scope, each after the one before. */
export function jobsOf(
  document: string,
  branch: string,
  actions: readonly Action[],
): PlannedJob[] {
  const jobs: PlannedJob[] = [];
  actions.forEach((action, index) => {
    const last = jobs.at(-1);
    if (last && last.scope === action.scope) {
      last.actions.push(action);
      last.entries[1] = index;
      return;
    }
    jobs.push({
      key: `j${jobs.length}`,
      documentId: document,
      scope: action.scope,
      branch,
      actions: [action],
      dependsOn: last ? [last.key] : [],
      entries: [index, index],
    });
  });
  return jobs;
}

/** A job of a batch that failed, as the person (and `--json`) reads it. */
export type BatchJobReport = {
  key: string;
  scope: string;
  /** The `--actions` entries it sent, first and last (0-based). */
  entries: [number, number];
  types: string[];
  /** As the host reports it: READ_READY or WRITE_READY applied, FAILED did not. */
  status: string;
  error?: string;
};

/** A batch with a failed job: every job's state, for a retry to skip what applied. */
class MutateBatchError extends MutateError {
  constructor(
    message: string,
    readonly jobs: BatchJobReport[],
  ) {
    super(message);
  }
}

/** Every planned job's state after a batch failed (`jobs` as the host gave them). */
export function batchReport(
  planned: readonly PlannedJob[],
  jobs: Readonly<
    Record<string, { status: string; error?: { message?: string } }>
  >,
): BatchJobReport[] {
  return planned.map((job) => {
    const info = jobs[job.key];
    return {
      key: job.key,
      scope: job.scope,
      entries: job.entries,
      types: typesOf(job.actions),
      status: info?.status ?? "UNKNOWN",
      ...(info?.error?.message ? { error: info.error.message } : {}),
    };
  });
}

/** How a failed batch reads: one line per job, then what a retry sends. */
export function describeBatch(jobs: readonly BatchJobReport[]): string[] {
  const applied = (job: BatchJobReport) =>
    job.status === "READ_READY" || job.status === "WRITE_READY";
  const entries = ([first, last]: [number, number]) =>
    first === last ? `entry ${first}` : `entries ${first}-${last}`;
  const rest = jobs.filter((job) => !applied(job));
  return [
    `The actions went as ${jobs.length} jobs, one per run of one scope. A batch is not atomic: a job's failure leaves the others' writes.`,
    ...jobs.map(
      (job) =>
        `  ${job.key}  ${entries(job.entries)} (${job.scope}: ${job.types.join(", ")})  ${applied(job) ? "applied" : job.status}${job.error ? `: ${job.error}` : ""}`,
    ),
    rest.length === jobs.length
      ? "Nothing applied: send the file again."
      : `Applied ones are on the document: resend only ${rest.map((job) => entries(job.entries)).join(", ")}.`,
  ];
}

async function sendActions(
  client: GraphQLReactorClient,
  plan: Extract<Plan, { kind: "actions" }>,
): Promise<PHDocument> {
  const { document, branch, actions } = plan;
  // One action is stamped and signed against the document's head; several
  // are signed one by one in a batch, so no model has to predict the chain.
  if (actions.length === 1) {
    return client.execute(document, branch, actions);
  }
  const planned = jobsOf(document, branch, actions);
  let jobs: Awaited<ReturnType<GraphQLReactorClient["executeBatch"]>>["jobs"];
  try {
    ({ jobs } = await client.executeBatch({
      jobs: planned.map(({ entries: _entries, ...job }) => job),
    }));
  } catch (error) {
    const { BatchJobFailedError } =
      await import("@powerhousedao/reactor-browser/graphql-client");
    if (!BatchJobFailedError.isError(error)) throw error;
    throw new MutateBatchError(
      `Failed: ${error.message}`,
      batchReport(planned, error.jobs),
    );
  }
  const last = Object.values(jobs).at(-1);
  return client.get(
    last?.documentId ?? document,
    { branch },
    undefined,
    last?.consistencyToken,
  );
}

export async function runMutate(
  args: MutateArgs,
  io: MutateIo = defaultMutateIo(),
): Promise<number> {
  let client: GraphQLReactorClient | undefined;
  let models: Models | undefined;
  try {
    const { generateActionId } =
      await import("@powerhousedao/shared/document-model");
    const plan = mutatePlan(args, { cwd: io.cwd, makeId: generateActionId });
    const projectDir = findProjectDir(io.cwd);
    const host = hostOf(args, projectDir ?? io.cwd, io.env);

    const { openSession } = await import("@renown/sdk/identity");
    // Outside a project (and without PH_USER_DATA_DIR) the identity home's
    // pseudonym signs, and nothing is written in the current folder.
    const dataDir =
      projectDir || io.env.PH_USER_DATA_DIR
        ? identityDataDir(projectDir ?? io.cwd, io.env)
        : undefined;
    const session = await openSession({
      ...(dataDir ? { dataDir } : {}),
      label: MUTATE_SESSION_LABEL,
      place: "home",
      interactive: io.interactive,
      // A pseudonym's credential is enrolled there; Renown vouches for a login's.
      target: { url: host.base },
      env: io.env,
    });
    const signer = signedAs(session);

    if (plan.kind === "create") models = await modelsOf(projectDir, io);
    const { GraphQLReactorClient } =
      await import("@powerhousedao/reactor-browser/graphql-client");
    const held = models;
    client = new GraphQLReactorClient({
      url: host.graphql,
      signer: session.actionSigner,
      tokenProvider: () => session.bearer(),
      realtime: false,
      ...(held ? { documentModels: () => held.current() } : {}),
    });

    switch (plan.kind) {
      case "actions": {
        const document = await sendActions(client, plan);
        const types = typesOf(plan.actions);
        const scopes = [...new Set(plan.actions.map((a) => a.scope))];
        if (args.json) {
          io.out(
            JSON.stringify(
              {
                documentId: document.header.id,
                branch: plan.branch,
                actions: plan.actions.map((a) => a.type),
                revision: document.header.revision,
                signer,
              },
              null,
              2,
            ),
          );
        } else {
          const revisions = scopes
            .map(
              (scope) =>
                `${scope} revision ${document.header.revision[scope] ?? 0}`,
            )
            .join(", ");
          io.out(
            `Signed ${types.join(", ")} on ${document.header.id}${plan.branch === "main" ? "" : ` (${plan.branch})`} as ${signer.as}: ${revisions}.`,
          );
        }
        return 0;
      }
      case "create": {
        const known = held!
          .current()
          .some((m) => m.documentModel.global.id === plan.documentType);
        if (!known) {
          throw new MutateError(
            `ph-cli holds no document model ${plan.documentType}: neither the base models, the project's document-models folder nor a package powerhouse.config.json names provides it. ` +
              "Install the package that provides it (`ph install <package>`), or build the project's own models, then try again.",
          );
        }
        const fresh = await client.newDocument(plan.documentType, {
          ...(plan.parent ? { parentIdentifier: plan.parent } : {}),
          ...(plan.name !== undefined ? { name: plan.name } : {}),
        });
        const created = await client.create(fresh, plan.parent);
        if (args.json) {
          io.out(
            JSON.stringify(
              {
                documentId: created.header.id,
                documentType: created.header.documentType,
                name: created.header.name,
                ...(plan.parent ? { parent: plan.parent } : {}),
                signer,
              },
              null,
              2,
            ),
          );
        } else {
          io.out(
            `Created ${created.header.documentType} ${created.header.id}${plan.parent ? ` in ${plan.parent}` : ""} as ${signer.as}.`,
          );
        }
        return 0;
      }
      default: {
        await client.deleteDocument(
          plan.document,
          (plan.cascade ? "cascade" : "none") as PropagationMode,
        );
        if (args.json) {
          io.out(
            JSON.stringify(
              {
                documentId: plan.document,
                deleted: true,
                cascade: plan.cascade,
                signer,
              },
              null,
              2,
            ),
          );
        } else {
          io.out(
            `Deleted ${plan.document}${plan.cascade ? " and the documents only it held" : ""} as ${signer.as}.`,
          );
        }
        return 0;
      }
    }
  } catch (error) {
    return failed(error, args, io);
  } finally {
    client?.dispose();
    await models?.close().catch(() => undefined);
  }
}

function failed(error: unknown, args: MutateArgs, io: MutateIo): number {
  const refusals = refusalsOf(error);
  const message = error instanceof Error ? error.message : String(error);
  const batch = error instanceof MutateBatchError ? error.jobs : undefined;
  if (args.json) {
    io.out(
      JSON.stringify(
        {
          ok: false,
          ...(refusals.length > 0 ? { refusals } : { error: message }),
          ...(batch ? { jobs: batch } : {}),
        },
        null,
        2,
      ),
    );
  }
  if (batch) {
    io.err(message);
    for (const line of describeBatch(batch)) io.err(line);
  } else if (refusals.length > 0) {
    for (const refusal of refusals) io.err(describeRefusal(refusal));
  } else {
    io.err(error instanceof MutateError ? message : `Failed: ${message}`);
  }
  return 1;
}
