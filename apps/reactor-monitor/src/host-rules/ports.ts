// The ports a host's members bind, as declared and in the monitor's copy.
import { isRecord, type Member, type MemberRole } from "./members.ts";

/** A copy's Connect moves up by this, clear of a scaffold's own ports. */
export const COPY_CONNECT_PORT_OFFSET = 10_000;

const MAX_PORT = 65_535;

// The ph-cli runners' defaults when a host names no port.
const DEFAULT_PORTS: Partial<Record<MemberRole, number>> = {
  switchboard: 4001,
  connect: 3000,
};

type PortHolder = Pick<Member, "key" | "role" | "runner">;

/** The port a runner binds when it is known up front: not 0, not a token. */
export function fixedPortOf(
  runner: Record<string, unknown>,
  role: MemberRole,
): number | undefined {
  const port = runner.port;
  if (port === undefined) return DEFAULT_PORTS[role];
  return typeof port === "number" && Number.isInteger(port) && port > 0
    ? port
    : undefined;
}

/** The port a Connect's copy starts from: its own number, else the default. */
function copyBaseOf(member: PortHolder): number {
  return typeof member.runner.port === "number"
    ? member.runner.port
    : (DEFAULT_PORTS.connect ?? 0);
}

/** The port a member binds in the monitor's copy; switchboards take a free one. */
export function copyPortOf(member: PortHolder): number | undefined {
  if (member.role === "switchboard") return undefined;
  if (member.role === "connect") {
    return copyBaseOf(member) + COPY_CONNECT_PORT_OFFSET;
  }
  return fixedPortOf(member.runner, member.role);
}

/** How the host names a member's port, for messages. */
function declaredPort(member: PortHolder): string {
  const port = member.runner.port;
  if (typeof port === "number") return `port ${port}`;
  if (port === undefined) {
    const fallback = DEFAULT_PORTS[member.role];
    return fallback === undefined ? "no port" : `port ${fallback}`;
  }
  if (isRecord(port) && typeof port.$env === "string") {
    return `port from ${port.$env}`;
  }
  return "a port set when it starts";
}

/** Why a member lands on its copy port, for each way a host names a port. */
function copyReason(member: PortHolder): string {
  const port = member.runner.port;
  const copy = copyPortOf(member);
  if (member.role !== "connect") return `${member.key} keeps port ${copy}`;
  if (typeof port === "number") {
    return `${member.key} is on ${port}, which the copy moves up by ${COPY_CONNECT_PORT_OFFSET}`;
  }
  if (port === undefined) {
    return `${member.key} names no port, so the copy starts it on ${copy}`;
  }
  const source =
    isRecord(port) && typeof port.$env === "string"
      ? `from ${port.$env}`
      : "when it starts";
  return `${member.key} takes its port ${source}, which the copy doesn't read, so the copy starts it on ${copy}`;
}

export type PortClash<M extends PortHolder = Member> = {
  /** The member to give another port. */
  member: M;
  other: M;
  port: number;
  message: string;
};

export function portClashMessage(
  first: Pick<Member, "key">,
  second: Pick<Member, "key">,
  port: number,
): string {
  return `${first.key} and ${second.key} both use port ${port}. Give one of them another port.`;
}

/** Each member that binds a port an earlier member already binds. */
export function portClashes<M extends PortHolder>(
  members: readonly M[],
): PortClash<M>[] {
  const owners = new Map<number, M>();
  const clashes: PortClash<M>[] = [];
  for (const member of members) {
    const port = fixedPortOf(member.runner, member.role);
    if (port === undefined) continue;
    const other = owners.get(port);
    if (other) {
      clashes.push({
        member,
        other,
        port,
        message: portClashMessage(other, member, port),
      });
    } else owners.set(port, member);
  }
  return clashes;
}

/** A Connect whose copy port is past the last port. */
export function copyPortOverflow(member: PortHolder): string | undefined {
  const port = copyPortOf(member);
  if (member.role !== "connect" || port === undefined || port <= MAX_PORT) {
    return undefined;
  }
  return `${member.key} uses ${declaredPort(member)}, so the monitor's copy has no port for its Connect (${port} is too high). Give it a port below ${MAX_PORT + 1 - COPY_CONNECT_PORT_OFFSET}.`;
}

/** Copy-port clashes; `member` is the Connect the offset moved, else the later one. */
export function copyPortClashes<M extends PortHolder>(
  members: readonly M[],
): PortClash<M>[] {
  const owners = new Map<number, M>();
  const clashes: PortClash<M>[] = [];
  for (const member of members) {
    const port = copyPortOf(member);
    if (port === undefined || port > MAX_PORT) continue;
    const other = owners.get(port);
    if (!other) {
      owners.set(port, member);
      continue;
    }
    const moved =
      member.role !== "connect" && other.role === "connect" ? other : member;
    clashes.push({
      member: moved,
      other: moved === member ? other : member,
      port,
      message: `${other.key} and ${member.key} would both use port ${port} when the monitor starts its copy: ${copyReason(other)}; ${copyReason(member)}. Give ${moved.key} another port.`,
    });
  }
  return clashes;
}

/** Copy clashes the declared ports don't already show. */
export function copyOnlyClashes<M extends PortHolder>(
  members: readonly M[],
): PortClash<M>[] {
  return copyPortClashes(members).filter(({ member, other }) => {
    const port = fixedPortOf(member.runner, member.role);
    return port === undefined || port !== fixedPortOf(other.runner, other.role);
  });
}

/** The first port above `from` free among `others`, as declared and in the copy. */
export function nextFreePort(
  role: MemberRole,
  from: number,
  others: readonly PortHolder[],
): number | undefined {
  const declared = new Set(
    others.map((other) => fixedPortOf(other.runner, other.role)),
  );
  const copied = new Set(others.map((other) => copyPortOf(other)));
  for (let port = from + 1; port <= MAX_PORT; port++) {
    if (declared.has(port)) continue;
    const copy = copyPortOf({ key: "", role, runner: { port } });
    if (copy !== undefined && (copy > MAX_PORT || copied.has(copy))) continue;
    return port;
  }
  return undefined;
}

/** Where a member's port search starts: its own, else its runner's default. */
export function portBaseOf(member: PortHolder): number {
  return (
    fixedPortOf(member.runner, member.role) ?? DEFAULT_PORTS[member.role] ?? 0
  );
}
