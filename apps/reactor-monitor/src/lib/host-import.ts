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
  placementKeyIssues,
  switchboardOfDrive,
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
/** A hostile export can share nested compounds to blow the walk up. */
export const MAX_IMPORT_MEMBERS = 1000;

export type ImportRow = {
  include: boolean;
  descriptor: ProjectedDescriptor;
  /** The member's key path in the compound, or the host name standalone. */
  member: string;
  backend: string;
  /** Remote rows only. `derived` marks a URL guessed from the producer;
   * `reason` says why there is no URL, when the declaration names one. */
  url?: { value?: string; derived: boolean; reason?: string };
  /** Why the row cannot be imported; such a row stays excluded. */
  excluded?: string;
};

export type ImportPlan = {
  setName: string;
  /** Member instances walked (a folder run by two children counts twice). */
  memberCount: number;
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
    const seen = new Set<string>();
    for (const [folder, body] of bodies) {
      const found = bodyIssues(folder, body);
      if (found.length > 0) reparsed.add(hostFile(folder));
      for (const issue of found) {
        seen.add(`${issue.file}\0${issue.path}\0${issue.message}`);
      }
      issues.push(...found);
    }
    for (const issue of result.error.issues) {
      const at = locate(issue.path, name);
      const path = pathOf(at.path);
      // A body-root issue is the summary the re-parse replaced.
      if (reparsed.has(at.file) && at.path.length === 0) continue;
      if (seen.has(`${at.file}\0${path}\0${issue.message}`)) continue;
      issues.push({
        severity: "error",
        stage: "declared",
        file: at.file,
        path,
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
  issues.push(...placementIssues(bodies, exp.members));
  return issues.length > 0 ? { issues } : { export: exp, issues };
}

/** `ph run`'s placement key check: each folder, and each child as merged. */
function placementIssues(
  bodies: readonly [string, unknown][],
  members: HostExport["members"],
): ImportIssue[] {
  const issues: ImportIssue[] = [];
  const own = new Map<string, Set<string>>();
  const push = (file: string, path: (string | number)[], message: string) =>
    issues.push({
      severity: "error",
      stage: "declared",
      file,
      path: formatPath(path),
      message,
    });
  for (const [folder, body] of bodies) {
    if (!isRecord(body) || "children" in body) continue;
    const found = placementKeyIssues(body);
    own.set(folder, new Set(found.map((issue) => issue.message)));
    for (const issue of found)
      push(hostFile(folder), issue.path, issue.message);
  }
  for (const [folder, body] of bodies) {
    if (!isRecord(body) || !isRecord(body.children)) continue;
    for (const [key, wrapper] of Object.entries(body.children)) {
      if (!isRecord(wrapper) || typeof wrapper.host !== "string") continue;
      const member = Object.hasOwn(members, wrapper.host)
        ? members[wrapper.host]
        : undefined;
      if (!isRecord(member) || "children" in member) continue;
      const merged = applyChildWrapper(
        member as HostDefinition,
        wrapper as ChildWrapper,
      );
      for (const issue of placementKeyIssues(merged)) {
        if (wrapper.reactor !== undefined) {
          push(
            hostFile(folder),
            ["children", key, ...issue.path],
            issue.message,
          );
        } else if (own.get(wrapper.host)?.has(issue.message) !== true) {
          // The key is in the folder; the wrapper's plugins made it unknown.
          push(hostFile(wrapper.host), issue.path, issue.message);
        }
      }
    }
  }
  return issues;
}

type Site = { file: string; path: string[] };

type Member = {
  /** The child key (the host name standalone): what `$output.member` names. */
  key: string;
  /** Dotted key path; nested compound members carry their parents' keys. */
  name: string;
  folder: string;
  draft: MemberDraft;
  /** The members of the compound this one sits in: `$output`'s scope. */
  siblings: readonly { key: string; host: string }[];
  /** Dotted key path of that compound ("" at the top). */
  scope: string;
  /** Where the member's effective `reactor` block is written. */
  reactorAt: Site;
  /** Where its effective `runner.port` is written. */
  portAt: Site;
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
        siblings: [{ key: exp.name, host: exp.name }],
        scope: "",
        reactorAt: { file: hostFile(exp.name), path: ["reactor"] },
        portAt: { file: hostFile(exp.name), path: ["runner", "port"] },
      },
    ];
  }
  const members: Member[] = [];
  let visited = 0;
  const visit = (
    folder: string,
    children: Record<string, ChildWrapper>,
    ancestors: readonly string[],
    prefix: readonly string[],
  ): boolean => {
    const siblings = Object.entries(children).map(([key, wrapper]) => ({
      key,
      host: wrapper.host,
    }));
    for (const [key, wrapper] of Object.entries(children)) {
      visited += 1;
      if (visited > MAX_IMPORT_MEMBERS) return false;
      const name = [...prefix, key].join(".");
      const at = (path: string[], severity: ImportSeverity, message: string) =>
        issues.push({
          severity,
          stage: "declared",
          file: hostFile(folder),
          path: formatPath(["children", key, ...path]),
          message,
        });
      const body: unknown = Object.hasOwn(exp.members, wrapper.host)
        ? exp.members[wrapper.host]
        : undefined;
      if (!isRecord(body)) {
        at(
          ["host"],
          "error",
          `Member "${name}" runs "${wrapper.host}", which is not in members.`,
        );
        continue;
      }
      if (ancestors.includes(wrapper.host)) {
        at(
          ["host"],
          "warning",
          `Member "${name}" runs "${wrapper.host}", which contains this compound; the cycle is not followed.`,
        );
        continue;
      }
      const definition = body as HostDefinition;
      if ("children" in definition) {
        const complete = visit(
          wrapper.host,
          definition.children as Record<string, ChildWrapper>,
          [...ancestors, wrapper.host],
          [...prefix, key],
        );
        if (!complete) return false;
        continue;
      }
      members.push({
        key,
        name,
        folder: wrapper.host,
        draft: applyChildWrapper(definition, wrapper),
        siblings,
        scope: prefix.join("."),
        reactorAt:
          wrapper.reactor === undefined
            ? { file: hostFile(wrapper.host), path: ["reactor"] }
            : { file: hostFile(folder), path: ["children", key, "reactor"] },
        portAt:
          wrapper.runner?.port === undefined
            ? { file: hostFile(wrapper.host), path: ["runner", "port"] }
            : {
                file: hostFile(folder),
                path: ["children", key, "runner", "port"],
              },
      });
    }
    return true;
  };
  const complete = visit(
    exp.name,
    host.children as Record<string, ChildWrapper>,
    [exp.name],
    [],
  );
  if (!complete) {
    issues.push({
      severity: "error",
      stage: "declared",
      file: hostFile(exp.name),
      path: "children",
      message: `The compound reaches more than ${MAX_IMPORT_MEMBERS} members; nothing is imported.`,
    });
    return [];
  }
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

const DEFAULT_DRIVE_SLUG = "powerhouse";
const HASHED_HOME =
  "its drives' addresses are known only once it starts; enter one of them";

/** The slug a switchboard member serves a declared drive under, when the
 * browser can know it: a `projectHash: true` drive is served hashed. */
function servedSlug(member: Member, slug: string): string | undefined {
  const drives = (member.draft.reactor as ReactorConfig | undefined)?.drives;
  if (!Array.isArray(drives)) return slug;
  const declared = drives.find((drive) => drive.slug === slug);
  return declared?.projectHash === true ? undefined : slug;
}

/** The drive a switchboard member is linked by: its first local declared
 * drive, or the implicit default drive when it declares none. */
function homeSlug(member: Member): string | undefined {
  const drives = (member.draft.reactor as ReactorConfig | undefined)?.drives;
  if (drives === undefined) return DEFAULT_DRIVE_SLUG;
  if (!Array.isArray(drives)) return undefined;
  const local = drives.find((drive) => drive.remote === undefined);
  return local && servedSlug(member, local.slug);
}

function driveUrl(port: number, slug: string): string {
  return `http://localhost:${port}/d/${encodeURIComponent(slug)}`;
}

/** A literal, a derived `$output`, or why the user must type one. */
function remoteUrl(
  value: unknown,
  consumer: Member,
  members: readonly Member[],
): { value?: string; derived: boolean; reason?: string } {
  if (typeof value === "string") {
    return switchboardOfDrive(value)
      ? { value, derived: false }
      : {
          derived: false,
          reason: `${value} is not a switchboard drive address (<switchboard>/d/<slug>)`,
        };
  }
  const token = outputTokenSchema.safeParse(value);
  if (!token.success) {
    const key = tokenKeyOf(value) ?? "a value";
    return {
      derived: false,
      reason: `it is ${key}, which only a running host resolves`,
    };
  }
  const ref = token.data.$output;
  const [drives, slug, url, ...rest] = ref.path;
  if (
    drives !== "drives" ||
    typeof slug !== "string" ||
    url !== "url" ||
    rest.length > 0
  ) {
    return {
      derived: false,
      reason: `$output path ${formatPath(ref.path)} is not a switchboard drive address; use drives.<slug>.url`,
    };
  }
  const found = memberForRef(ref, consumer.siblings);
  if ("error" in found) {
    return { derived: false, reason: `the $output ${found.error}` };
  }
  const producer = members.find(
    (member) => member.scope === consumer.scope && member.key === found.key,
  );
  const port = producer && switchboardPort(producer);
  if (!producer || port === undefined) {
    return {
      derived: false,
      reason: `member "${found.key}" is not a switchboard with a fixed port`,
    };
  }
  const served = servedSlug(producer, slug);
  if (served === undefined) {
    return {
      derived: false,
      reason: `drive "${slug}" is served under a hashed slug that only the running switchboard reports`,
    };
  }
  return { value: driveUrl(port, served), derived: true };
}

// renown gets its own info issue.
const LISTED_REACTOR_KEYS = new Set(["backends", "protocol", "renown"]);
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
    if (!LISTED_REACTOR_KEYS.has(key)) ignored.push(`reactor.${key}`);
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
      const slug = homeSlug(member);
      const url =
        port === undefined || slug === undefined
          ? undefined
          : driveUrl(port, slug);
      if (url === undefined) {
        issues.push({
          severity: "warning",
          stage: "declared",
          file: port === undefined ? member.portAt.file : at.file,
          path: formatPath(
            port === undefined ? member.portAt.path : [...at.path, "drives"],
          ),
          message:
            port === undefined
              ? `Member "${member.name}" binds no fixed port; enter one of its drive addresses.`
              : `Member "${member.name}" serves no drive whose address is known before it starts; enter one of its drive addresses.`,
        });
      }
      return [
        {
          include: true,
          descriptor: { kind: "remote", name, remote: { url: url ?? "" } },
          member: member.name,
          backend: MAIN_BACKEND,
          url: {
            value: url,
            derived: url !== undefined,
            ...(port !== undefined && slug === undefined
              ? { reason: HASHED_HOME }
              : {}),
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
    if (declared.kind === "remote") {
      const resolved = remoteUrl(declared.remote?.url, member, members);
      if (resolved.reason) {
        issue(
          "warning",
          [...path, "remote", "url"],
          `${name}: enter a switchboard drive address (${resolved.reason}).`,
        );
      }
      rows.push({
        ...base,
        include: true,
        descriptor: {
          kind: "remote",
          name,
          remote: { url: resolved.value ?? "" },
        },
        url: {
          value: resolved.value,
          derived: resolved.derived,
          ...(resolved.reason ? { reason: resolved.reason } : {}),
        },
      });
      continue;
    }
    let backend = declared as ReactorBackend;
    if (declared.storage?.kind === "path") {
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
    rows.push({ ...base, include: true, descriptor });
  }
  return rows;
}

/** One set per export; remote rows deduplicated by switchboard, first name wins. */
export function planImport(exp: HostExport): ImportPlan {
  const issues: ImportIssue[] = [];
  const members = walkMembers(exp, issues);
  const rows: ImportRow[] = [];
  const byBase = new Map<string, string>();
  for (const member of members) {
    for (const row of memberRows(member, members, issues)) {
      const url = row.url?.value;
      const base =
        url === undefined ? undefined : switchboardOfDrive(url)?.base;
      const kept = base === undefined ? undefined : byBase.get(base);
      if (kept !== undefined) {
        issues.push({
          severity: "info",
          stage: "declared",
          file: hostFile(member.folder),
          path: "",
          message: `${row.descriptor.name} attaches to the switchboard at ${base}, as ${kept} does; only ${kept} is imported.`,
        });
        continue;
      }
      if (base !== undefined) byBase.set(base, row.descriptor.name);
      rows.push(row);
    }
  }
  return { setName: exp.name, memberCount: members.length, rows, issues };
}
