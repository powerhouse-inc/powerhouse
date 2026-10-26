// `ph host export` → monitor descriptors. Browser code: neutral host-core entries only.
import {
  applyChildWrapper,
  backendToDescriptor,
  checkTokenSites,
  formatPath,
  memberForRef,
  type MemberDraft,
  type ProjectedDescriptor,
} from "@powerhousedao/host-core/projection";
import {
  declaredHostSchemas,
  hostExportSchema,
  outputTokenSchema,
  tokenKeyOf,
  type ChildWrapper,
  type HostDefinition,
  type HostExport,
  type HostIssue,
  type ReactorBackend,
  type ReactorConfig,
} from "@powerhousedao/host-core/schema";

export type ImportSeverity = "error" | "warning" | "info";

export type ImportIssue = HostIssue & { severity: ImportSeverity };

/** Issues about the envelope itself rather than a host file. */
export const EXPORT_FILE = "export";

const SWITCHBOARD_RUNNER = "/runners/switchboard";
const MAIN_BACKEND = "main";

export type ImportRow = {
  include: boolean;
  descriptor: ProjectedDescriptor;
  /** The member's key path in the compound, or the host name standalone. */
  member: string;
  backend: string;
  /** Remote rows only. `derived` marks a URL guessed from the producer. */
  url?: { value?: string; derived: boolean };
  /** Why the row cannot be imported; such a row stays excluded. */
  excluded?: string;
};

export type ImportPlan = {
  setName: string;
  rows: ImportRow[];
  issues: ImportIssue[];
};

type Path = readonly PropertyKey[];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hostFile(folder: string): string {
  return `hosts/${folder}/host.js`;
}

function pathOf(path: Path): string {
  const segments = path.filter(
    (segment): segment is string | number => typeof segment !== "symbol",
  );
  return segments.length === 0 ? "" : formatPath(segments);
}

function bodyIssues(folder: string, body: unknown): ImportIssue[] {
  const schema =
    isRecord(body) && "children" in body
      ? declaredHostSchemas.compoundHostSchema
      : declaredHostSchemas.reactorHostSchema;
  const result = schema.safeParse(body);
  if (result.success) return [];
  return result.error.issues.map((issue) => ({
    severity: "error",
    stage: "declared",
    file: hostFile(folder),
    path: pathOf(issue.path),
    message: issue.message,
  }));
}

/** Where an envelope path points: a host file and the path inside it. */
function locate(path: Path, name: string): { file: string; path: Path } {
  if (path[0] === "host") return { file: hostFile(name), path: path.slice(1) };
  if (path[0] === "members" && typeof path[1] === "string") {
    return { file: hostFile(path[1]), path: path.slice(2) };
  }
  return { file: EXPORT_FILE, path };
}

/** Browser-side checks only; any error leaves `export` undefined. */
export function parseHostExport(text: string): {
  export?: HostExport;
  issues: ImportIssue[];
} {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    return {
      issues: [
        {
          severity: "error",
          stage: "load",
          file: EXPORT_FILE,
          path: "",
          message: `Not JSON: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
  const result = hostExportSchema.safeParse(json);
  if (!result.success) {
    const name =
      isRecord(json) && typeof json.name === "string" ? json.name : "?";
    // The envelope reports a bad body at the body's root; re-parse for field paths.
    const bodies: [folder: string, body: unknown][] = [];
    if (isRecord(json) && "host" in json) bodies.push([name, json.host]);
    if (isRecord(json) && isRecord(json.members)) {
      bodies.push(...Object.entries(json.members));
    }
    const issues: ImportIssue[] = [];
    const reparsed = new Set<string>();
    for (const [folder, body] of bodies) {
      const found = bodyIssues(folder, body);
      if (found.length > 0) reparsed.add(hostFile(folder));
      issues.push(...found);
    }
    for (const issue of result.error.issues) {
      const at = locate(issue.path, name);
      if (reparsed.has(at.file)) continue;
      issues.push({
        severity: "error",
        stage: "declared",
        file: at.file,
        path: pathOf(at.path),
        message: issue.message,
      });
    }
    return { issues };
  }
  const exp = json as HostExport;
  const issues: ImportIssue[] = [];
  const bodies: [string, unknown][] = [
    [exp.name, exp.host],
    ...Object.entries(exp.members),
  ];
  for (const [folder, body] of bodies) {
    for (const issue of checkTokenSites(body)) {
      issues.push({
        severity: "error",
        stage: "declared",
        file: hostFile(folder),
        path: issue.path,
        message: issue.message,
      });
    }
  }
  return issues.length > 0 ? { issues } : { export: exp, issues };
}

type Member = {
  /** The child key (the host name standalone): what `$output.member` names. */
  key: string;
  /** Dotted key path; nested compound members carry their parents' keys. */
  name: string;
  folder: string;
  draft: MemberDraft;
  /** Where the member's effective `reactor` block is written. */
  reactorAt: { file: string; path: string[] };
};

function walkMembers(exp: HostExport, issues: ImportIssue[]): Member[] {
  const host = exp.host as HostDefinition;
  if (!("children" in host)) {
    return [
      {
        key: exp.name,
        name: exp.name,
        folder: exp.name,
        draft: host as MemberDraft,
        reactorAt: { file: hostFile(exp.name), path: ["reactor"] },
      },
    ];
  }
  const members: Member[] = [];
  const visit = (
    folder: string,
    children: Record<string, ChildWrapper>,
    ancestors: readonly string[],
    prefix: readonly string[],
  ): void => {
    for (const [key, wrapper] of Object.entries(children)) {
      const name = [...prefix, key].join(".");
      const body = exp.members[wrapper.host] as HostDefinition;
      if (ancestors.includes(wrapper.host)) {
        issues.push({
          severity: "warning",
          stage: "declared",
          file: hostFile(folder),
          path: `children.${key}.host`,
          message: `Member "${name}" runs "${wrapper.host}", which contains this compound; the cycle is not followed.`,
        });
        continue;
      }
      if ("children" in body) {
        visit(
          wrapper.host,
          body.children as Record<string, ChildWrapper>,
          [...ancestors, wrapper.host],
          [...prefix, key],
        );
        continue;
      }
      members.push({
        key,
        name,
        folder: wrapper.host,
        draft: applyChildWrapper(body, wrapper),
        reactorAt:
          wrapper.reactor === undefined
            ? { file: hostFile(wrapper.host), path: ["reactor"] }
            : {
                file: hostFile(folder),
                path: ["children", key, "reactor"],
              },
      });
    }
  };
  visit(
    exp.name,
    host.children as Record<string, ChildWrapper>,
    [exp.name],
    [],
  );
  return members;
}

function switchboardPort(member: Member): number | undefined {
  const runner = member.draft.runner;
  if (!runner.module.endsWith(SWITCHBOARD_RUNNER)) return undefined;
  const port = runner.port;
  return typeof port === "number" && Number.isInteger(port) && port > 0
    ? port
    : undefined;
}

function graphqlUrl(port: number): string {
  return `http://localhost:${port}/graphql`;
}

/** A literal, a derived `$output`, or why the user must type one. */
function remoteUrl(
  value: unknown,
  members: readonly Member[],
): { value?: string; derived: boolean; reason?: string } {
  if (typeof value === "string") return { value, derived: false };
  const token = outputTokenSchema.safeParse(value);
  if (!token.success) {
    const key = tokenKeyOf(value) ?? "a value";
    return {
      derived: false,
      reason: `it is ${key}, which only a running host resolves`,
    };
  }
  const ref = token.data.$output;
  if (ref.path.join(".") !== "endpoints.graphql") {
    return {
      derived: false,
      reason: `$output path ${formatPath(ref.path)} is not endpoints.graphql`,
    };
  }
  const found = memberForRef(
    ref,
    members.map((member) => ({ key: member.key, host: member.folder })),
  );
  if ("error" in found) {
    return { derived: false, reason: `the $output ${found.error}` };
  }
  const producer = members.find((member) => member.key === found.key);
  const port = producer && switchboardPort(producer);
  if (port === undefined) {
    return {
      derived: false,
      reason: `member "${found.key}" is not a switchboard with a fixed port`,
    };
  }
  return { value: graphqlUrl(port), derived: true };
}

const PROJECTED_REACTOR_KEYS = new Set(["backends", "protocol"]);
const PROJECTED_BACKEND_KEYS = new Set([
  "kind",
  "storage",
  "packages",
  "remote",
]);

function ignoredFields(draft: MemberDraft): string[] {
  const ignored: string[] = [];
  const runner = draft.runner as Record<string, unknown>;
  if (runner.plugins !== undefined) ignored.push("runner.plugins");
  if (draft.profile !== undefined) ignored.push("profile");
  if (draft.config !== undefined) ignored.push("config");
  const reactor = draft.reactor as ReactorConfig | undefined;
  if (!reactor) return ignored;
  for (const key of Object.keys(reactor)) {
    if (!PROJECTED_REACTOR_KEYS.has(key)) ignored.push(`reactor.${key}`);
  }
  for (const key of Object.keys(reactor.protocol ?? {})) {
    if (key !== "featureFlags") ignored.push(`reactor.protocol.${key}`);
  }
  for (const [name, backend] of Object.entries(reactor.backends ?? {})) {
    for (const key of Object.keys(backend)) {
      if (!PROJECTED_BACKEND_KEYS.has(key)) {
        ignored.push(`reactor.backends.${name}.${key}`);
      }
    }
  }
  return ignored;
}

function memberRows(
  member: Member,
  members: readonly Member[],
  issues: ImportIssue[],
): ImportRow[] {
  const reactor = member.draft.reactor as ReactorConfig | undefined;
  const at = member.reactorAt;
  const issue = (
    severity: ImportSeverity,
    path: string[],
    message: string,
  ): void => {
    issues.push({
      severity,
      stage: "declared",
      file: at.file,
      path: formatPath([...at.path, ...path]),
      message,
    });
  };

  const ignored = ignoredFields(member.draft);
  if (ignored.length > 0) {
    issues.push({
      severity: "info",
      stage: "declared",
      file: hostFile(member.folder),
      path: "",
      message: `Member "${member.name}": not projected into the monitor: ${ignored.join(", ")}.`,
    });
  }
  if (reactor?.renown !== undefined) {
    issue(
      "info",
      [],
      `Member "${member.name}": reactor.renown is not projected. Monitor reactors sign with an ephemeral key, sync on the default gql scheme and hold no attachment bytes.`,
    );
  }

  const backends = Object.entries(reactor?.backends ?? {});
  if (backends.length === 0) {
    const port = switchboardPort(member);
    if (member.draft.runner.module.endsWith(SWITCHBOARD_RUNNER)) {
      const name = `${member.name}.${MAIN_BACKEND}`;
      if (port === undefined) {
        issues.push({
          severity: "warning",
          stage: "declared",
          file: hostFile(member.folder),
          path: "runner.port",
          message: `Member "${member.name}" binds no fixed port; enter its GraphQL URL.`,
        });
      }
      return [
        {
          include: true,
          descriptor: {
            kind: "remote",
            name,
            remote: { url: port === undefined ? "" : graphqlUrl(port) },
          },
          member: member.name,
          backend: MAIN_BACKEND,
          url: {
            value: port === undefined ? undefined : graphqlUrl(port),
            derived: port !== undefined,
          },
        },
      ];
    }
    issues.push({
      severity: "info",
      stage: "declared",
      file: hostFile(member.folder),
      path: "",
      message: `Member "${member.name}" declares no reactor backends; nothing to import.`,
    });
    return [];
  }

  const rows: ImportRow[] = [];
  for (const [backendName, declared] of backends) {
    const name = `${member.name}.${backendName}`;
    const path = ["backends", backendName];
    const base = { member: member.name, backend: backendName };
    if (declared.storage?.kind === "postgres" && declared.kind !== "remote") {
      const reason = `storage "postgres" is server-side only; attach the switchboard that owns it as a remote instead.`;
      issue("error", [...path, "storage", "kind"], `${name}: ${reason}`);
      rows.push({
        ...base,
        include: false,
        descriptor: { kind: declared.kind, name },
        excluded: reason,
      });
      continue;
    }
    let backend = declared as ReactorBackend;
    let url: ImportRow["url"];
    if (declared.kind === "remote") {
      const resolved = remoteUrl(declared.remote?.url, members);
      if (resolved.reason) {
        issue(
          "warning",
          [...path, "remote", "url"],
          `${name}: enter its GraphQL URL (${resolved.reason}).`,
        );
      }
      url = { value: resolved.value, derived: resolved.derived };
      // A placeholder: the row carries the real (possibly missing) URL.
      backend = { ...declared, remote: { url: resolved.value ?? "unset:" } };
    } else if (declared.storage?.kind === "path") {
      issue(
        "warning",
        [...path, "storage"],
        `${name}: storage "path" becomes "idb" in the browser.`,
      );
      backend = { ...declared, storage: { kind: "idb" } } as ReactorBackend;
    }
    let descriptor: ProjectedDescriptor;
    try {
      descriptor = backendToDescriptor(name, backend, reactor?.protocol);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      issue("error", path, reason);
      rows.push({
        ...base,
        include: false,
        descriptor: { kind: declared.kind, name },
        excluded: reason,
      });
      continue;
    }
    if (descriptor.kind === "remote" && descriptor.remote) {
      descriptor.remote = { url: url?.value ?? "" };
    }
    if (descriptor.packages?.dynamic !== undefined) {
      const { dynamic: _dynamic, ...packages } = descriptor.packages;
      issue(
        "info",
        [...path, "packages", "dynamic"],
        `${name}: packages.dynamic is dropped; monitor reactors load only the listed packages.`,
      );
      if (Object.keys(packages).length > 0) descriptor.packages = packages;
      else delete descriptor.packages;
    }
    rows.push({ ...base, include: true, descriptor, url });
  }
  return rows;
}

/** One set per export; remote rows deduplicated by URL, first name wins. */
export function planImport(exp: HostExport): ImportPlan {
  const issues: ImportIssue[] = [];
  const members = walkMembers(exp, issues);
  const rows: ImportRow[] = [];
  const byUrl = new Map<string, string>();
  for (const member of members) {
    for (const row of memberRows(member, members, issues)) {
      const url = row.url?.value;
      const kept = url === undefined ? undefined : byUrl.get(url);
      if (kept !== undefined) {
        issues.push({
          severity: "info",
          stage: "declared",
          file: hostFile(member.folder),
          path: "",
          message: `${row.descriptor.name} attaches to ${url}, as ${kept} does; only ${kept} is imported.`,
        });
        continue;
      }
      if (url !== undefined) byUrl.set(url, row.descriptor.name);
      rows.push(row);
    }
  }
  return { setName: exp.name, rows, issues };
}
