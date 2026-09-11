// Network egress policy, enforced inside the worker child. Pieces bundle their
// own HTTP clients, so hooking one of them — or `fetch` — is bypassable.

// Every TCP connection in Node ends at `net.Socket.prototype.connect`, whatever
// the client, so that is the choke point installed here.

// This hardens SSRF inside a cooperative process; it is not a boundary against
// hostile code — see installEgressGuard.
import dgram from "node:dgram";
import dns from "node:dns";
import net, { isIP } from "node:net";
import { AsyncLocalStorage } from "node:async_hooks";
import type { EgressPolicy } from "./protocol.js";

export const EGRESS_DENIED_CODE = "EGRESS_DENIED";

// What a host applies when it expresses no preference: every public host is
// reachable, private space and the metadata endpoint are not.
export const DEFAULT_EGRESS_POLICY: EgressPolicy = {};

// Raised at connect time and delivered to the piece the way Node delivers a
// failed DNS lookup — an error on the socket — so any client surfaces it.
export class EgressDeniedError extends Error {
  readonly code = EGRESS_DENIED_CODE;
  readonly host: string;
  readonly port: number | undefined;
  readonly address: string | undefined;

  constructor(
    reason: string,
    where: { host: string; port?: number; address?: string },
  ) {
    super(`Egress denied: ${reason}`);
    this.name = "EgressDeniedError";
    this.host = where.host;
    this.port = where.port;
    this.address = where.address;
  }
}

// The SSRF surface: loopback, the RFC1918 ranges, the link-local block holding
// the 169.254.169.254 metadata endpoint, multicast, and the IPv6 equivalents.
const PRIVATE_RANGES = [
  "0.0.0.0/8",
  "10.0.0.0/8",
  "100.64.0.0/10",
  "127.0.0.0/8",
  "169.254.0.0/16",
  "172.16.0.0/12",
  "192.0.0.0/24",
  "192.0.2.0/24",
  "192.88.99.0/24",
  "192.168.0.0/16",
  "198.18.0.0/15",
  "198.51.100.0/24",
  "203.0.113.0/24",
  "224.0.0.0/4",
  "240.0.0.0/4",
  // Covers ::1 and the deprecated ::a.b.c.d forms in one range.
  "::/96",
  "fc00::/7",
  "fe80::/10",
  "ff00::/8",
  "2001:db8::/32",
  // 6to4 and NAT64 both carry an arbitrary IPv4 destination — 2002:a9fe:a9fe::
  // is the metadata endpoint — so the whole translation prefix is refused.
  "2002::/16",
  "64:ff9b::/96",
];

interface Cidr {
  bytes: Uint8Array;
  prefix: number;
}

function parseIpv4(value: string): Uint8Array | undefined {
  const parts = value.split(".");
  if (parts.length !== 4) return undefined;
  const bytes = new Uint8Array(4);
  for (let i = 0; i < 4; i++) {
    if (!/^\d{1,3}$/.test(parts[i])) return undefined;
    const octet = Number(parts[i]);
    if (octet > 255) return undefined;
    bytes[i] = octet;
  }
  return bytes;
}

function parseIpv6(value: string): Uint8Array | undefined {
  let text = value;
  // Rewrite an embedded IPv4 tail ("::ffff:1.2.3.4") as two hex groups, so the
  // group walk below has a single shape to handle.
  if (text.includes(".")) {
    const colon = text.lastIndexOf(":");
    const quad = parseIpv4(text.slice(colon + 1));
    if (!quad) return undefined;
    const high = ((quad[0] << 8) | quad[1]).toString(16);
    const low = ((quad[2] << 8) | quad[3]).toString(16);
    text = `${text.slice(0, colon + 1)}${high}:${low}`;
  }
  const halves = text.split("::");
  if (halves.length > 2) return undefined;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const fill = 8 - head.length - tail.length;
  if (halves.length === 1 ? fill !== 0 : fill < 0) return undefined;
  const groups = [...head, ...Array<string>(fill).fill("0"), ...tail];
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 8; i++) {
    if (!/^[0-9a-f]{1,4}$/i.test(groups[i])) return undefined;
    const group = Number.parseInt(groups[i], 16);
    bytes[i * 2] = group >> 8;
    bytes[i * 2 + 1] = group & 0xff;
  }
  return bytes;
}

// An IPv4-mapped address is classified as the v4 address it carries, or
// ::ffff:169.254.169.254 walks straight past the v4 ranges.
function unmapV4(bytes: Uint8Array): Uint8Array {
  for (let i = 0; i < 10; i++) if (bytes[i] !== 0) return bytes;
  if (bytes[10] !== 0xff || bytes[11] !== 0xff) return bytes;
  return bytes.slice(12);
}

export function parseAddress(value: string): Uint8Array | undefined {
  const bare = value.split("%")[0];
  const kind = isIP(bare);
  if (kind === 4) return parseIpv4(bare);
  if (kind !== 6) return undefined;
  const bytes = parseIpv6(bare);
  return bytes && unmapV4(bytes);
}

function parseCidr(spec: string): Cidr {
  const slash = spec.indexOf("/");
  const mask = slash === -1 ? "" : spec.slice(slash + 1);
  const bytes = parseAddress(slash === -1 ? spec : spec.slice(0, slash));
  if (!bytes) {
    throw new Error(`Egress policy entry "${spec}" is not an IP address`);
  }
  const width = bytes.length * 8;
  const prefix = mask === "" ? width : Number(mask);
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > width) {
    throw new Error(`Egress policy entry "${spec}" has an invalid prefix`);
  }
  return { bytes, prefix };
}

function inCidr(address: Uint8Array, cidr: Cidr): boolean {
  if (address.length !== cidr.bytes.length) return false;
  let remaining = cidr.prefix;
  for (let i = 0; i < address.length && remaining > 0; i++) {
    const bits = Math.min(8, remaining);
    const mask = (0xff << (8 - bits)) & 0xff;
    if ((address[i] & mask) !== (cidr.bytes[i] & mask)) return false;
    remaining -= bits;
  }
  return true;
}

const PRIVATE = PRIVATE_RANGES.map(parseCidr);

type NativeLookup = (
  hostname: string,
  options: dns.LookupOneOptions,
  callback: (error: Error | null, address: unknown, family?: number) => void,
) => void;

// getaddrinfo, taken before anything is patched: the guard resolves through
// this so its own lookups never meet the refusal it installs below.
const nativeLookup = originalOf<NativeLookup>(dns, "lookup");

// c-ares, which owns its sockets and never passes through dgram or connect.

// A query is a channel out on its own — the data rides in the name — so the
// answer is irrelevant and the whole surface is refused under a policy.
const RESOLVER_METHODS = [
  "resolve",
  "resolve4",
  "resolve6",
  "resolveAny",
  "resolveCaa",
  "resolveCname",
  "resolveMx",
  "resolveNaptr",
  "resolveNs",
  "resolvePtr",
  "resolveSoa",
  "resolveSrv",
  "resolveTxt",
  "reverse",
];

export function isPrivateAddress(value: string): boolean {
  const bytes = parseAddress(value);
  // An address we cannot classify counts as private: fail closed.
  if (!bytes) return true;
  return PRIVATE.some((cidr) => inCidr(bytes, cidr));
}

interface CompiledPolicy {
  hosts: string[] | undefined;
  addresses: Cidr[];
  ports: number[] | undefined;
  allowPrivate: boolean;
}

function compile(policy: EgressPolicy): CompiledPolicy {
  const hosts = policy.allowHosts?.map((host) => host.trim().toLowerCase());
  const ports = policy.allowPorts?.map((port) => {
    if (!Number.isInteger(port) || port < 0 || port > 65535) {
      throw new Error(`Egress policy port ${String(port)} is out of range`);
    }
    return port;
  });
  return {
    hosts: hosts && hosts.length > 0 ? hosts : undefined,
    addresses: (policy.allowAddresses ?? []).map(parseCidr),
    ports: ports && ports.length > 0 ? ports : undefined,
    allowPrivate: policy.allowPrivateAddresses === true,
  };
}

function hostAllowed(policy: CompiledPolicy, host: string): boolean {
  if (!policy.hosts) return true;
  const name = host.toLowerCase();
  return policy.hosts.some((entry) =>
    entry.startsWith("*.")
      ? name.length > entry.length - 1 && name.endsWith(entry.slice(1))
      : entry === name,
  );
}

function addressAllowed(policy: CompiledPolicy, address: string): boolean {
  const bytes = parseAddress(address);
  if (!bytes) return false;
  if (policy.addresses.some((cidr) => inCidr(bytes, cidr))) return true;
  return policy.allowPrivate || !isPrivateAddress(address);
}

// The policy of the request in flight, and the one the work started under: both
// apply, so a pooled client's callback chain cannot borrow a laxer context.

// A piece's leftover timer keeps the policy it was created with rather than
// whatever the next request brings.
let inFlight: CompiledPolicy | undefined;
const started = new AsyncLocalStorage<CompiledPolicy | undefined>();

function policiesInForce(): CompiledPolicy[] {
  const inherited = started.getStore();
  const policies: CompiledPolicy[] = [];
  if (inFlight) policies.push(inFlight);
  if (inherited && inherited !== inFlight) policies.push(inherited);
  return policies;
}

// Runs one request under its policy. Compiling first means a malformed policy
// fails the request rather than degrading it to no enforcement.
export async function runWithEgressPolicy<T>(
  policy: EgressPolicy | undefined,
  work: () => Promise<T>,
): Promise<T> {
  const compiled = policy ? compile(policy) : undefined;
  installEgressGuard();
  inFlight = compiled;
  try {
    return await started.run(compiled, work);
  } finally {
    // The request is over; what it left running keeps the policy it inherited,
    // so it can never become less restricted than it started.
    if (inFlight === compiled) inFlight = undefined;
  }
}

interface ConnectOptions {
  path?: string;
  port?: number | string;
  host?: string;
  lookup?: unknown;
  [key: string]: unknown;
}

// Node's own connect-argument shapes: (options) | (port[, host]) | (path), plus
// the pre-normalized [options, callback] array net.createConnection hands over.
function normalizeConnectArgs(args: unknown[]): {
  options: ConnectOptions;
  callback: unknown;
} {
  if (Array.isArray(args[0])) {
    const [options, callback] = args[0] as [ConnectOptions, unknown];
    return { options: { ...options }, callback };
  }
  const first = args[0];
  let options: ConnectOptions = {};
  if (typeof first === "object" && first !== null) {
    options = { ...(first as ConnectOptions) };
  } else if (typeof first === "string" && Number.isNaN(Number(first))) {
    options.path = first;
  } else {
    options.port = first as number;
    if (typeof args[1] === "string") options.host = args[1];
  }
  const last = args[args.length - 1];
  return { options, callback: typeof last === "function" ? last : undefined };
}

type LookupResult = { address: string; family: number }[];

type LookupCallback = (
  error: Error | null,
  address?: string | LookupResult,
  family?: number,
) => void;

// Classifies the address the socket is about to use, not the name the piece
// asked for: a name check alone loses to DNS rebinding.
function guardedLookup(
  policies: CompiledPolicy[],
  host: string,
  port: number | undefined,
): (hostname: string, options: unknown, callback: LookupCallback) => void {
  return (hostname, options, callback) => {
    const asked = options as { all?: boolean };
    nativeLookup(
      hostname,
      options as dns.LookupOneOptions,
      (error: Error | null, result: unknown, family?: number) => {
        if (error) {
          callback(error);
          return;
        }
        try {
          const entries: LookupResult = asked.all
            ? (result as LookupResult)
            : [{ address: result as string, family: family ?? 0 }];
          const permitted = entries.filter((entry) =>
            policies.every((policy) => addressAllowed(policy, entry.address)),
          );
          if (permitted.length === 0) {
            const seen = entries.map((entry) => entry.address).join(", ");
            callback(
              new EgressDeniedError(
                `host "${host}" resolves to ${seen || "nothing"}, which the policy does not permit`,
                { host, port, address: entries[0]?.address },
              ),
            );
            return;
          }
          if (asked.all) callback(null, permitted);
          else callback(null, permitted[0].address, permitted[0].family);
        } catch (failure) {
          // A defect in the guard denies the connection, never opens it.
          callback(
            failure instanceof Error ? failure : new Error(String(failure)),
          );
        }
      },
    );
  };
}

function denyReason(
  policies: CompiledPolicy[],
  options: ConnectOptions,
): EgressDeniedError | undefined {
  if (typeof options.path === "string") {
    return new EgressDeniedError(
      `connections to local socket "${options.path}" are not permitted`,
      { host: options.path },
    );
  }
  const host = typeof options.host === "string" ? options.host : "";
  const port = options.port === undefined ? undefined : Number(options.port);
  for (const policy of policies) {
    if (policy.ports && (port === undefined || !policy.ports.includes(port))) {
      return new EgressDeniedError(
        `port ${String(port)} on host "${host}" is not permitted`,
        { host, port },
      );
    }
    if (!hostAllowed(policy, host)) {
      return new EgressDeniedError(`host "${host}" is not on the allowlist`, {
        host,
        port,
      });
    }
    if (isIP(host) && !addressAllowed(policy, host)) {
      return new EgressDeniedError(`address ${host} is not permitted`, {
        host,
        port,
        address: host,
      });
    }
  }
  return undefined;
}

// Reports a denial the way Node reports an asynchronous socket failure, so a
// piece catches it from its client rather than from a synchronous throw.
function failLater(
  emitter: { emit: (event: string, error: Error) => boolean },
  error: EgressDeniedError,
  callback: unknown,
): void {
  process.nextTick(() => {
    if (typeof callback === "function") (callback as (e: Error) => void)(error);
    else emitter.emit("error", error);
  });
}

// Takes a method off its descriptor rather than as a method reference: what is
// wanted is the original implementation, re-applied with an explicit `this`.
function originalOf<T>(target: object, name: string): T {
  return Object.getOwnPropertyDescriptor(target, name)?.value as T;
}

function resolverDenial(method: string, args: unknown[]): EgressDeniedError {
  const host = typeof args[0] === "string" ? args[0] : "";
  return new EgressDeniedError(
    `DNS ${method}("${host}") is not permitted; use a hostname in a request instead`,
    { host },
  );
}

// Refuses every c-ares entry point on one object, in the shape its callers
// expect: a rejected promise here, a callback error there.
function refuseResolvers(target: object, promised: boolean): void {
  for (const method of RESOLVER_METHODS) {
    const original = originalOf<(this: unknown, ...args: unknown[]) => unknown>(
      target,
      method,
    );
    if (typeof original !== "function") continue;
    function refused(this: unknown, ...args: unknown[]): unknown {
      if (policiesInForce().length === 0) return original.apply(this, args);
      const denied = resolverDenial(method, args);
      if (promised) return Promise.reject(denied);
      const callback = args[args.length - 1];
      // No callback is a programming error Node would throw on anyway.
      if (typeof callback !== "function") throw denied;
      process.nextTick(() => (callback as (error: Error) => void)(denied));
      return undefined;
    }
    seal(target, method, refused);
  }
}

// Sealed so a piece holding the pristine implementation cannot put it back, and
// so a later assignment cannot quietly unhook the guard.
function seal(target: object, name: string, value: unknown): void {
  Object.defineProperty(target, name, {
    value,
    writable: false,
    configurable: false,
    enumerable: false,
  });
}

let installed = false;

// Installed when the worker child starts, before any piece code can run, and a
// no-op while no policy is in force.

// Not a boundary against hostile code: a child process or a worker thread gets
// its own copy of these modules. Isolation is a network namespace, not this.
export function installEgressGuard(): void {
  if (installed) return;
  installed = true;

  const connect = originalOf<
    (this: net.Socket, ...args: unknown[]) => net.Socket
  >(net.Socket.prototype, "connect");

  function patchedConnect(this: net.Socket, ...args: unknown[]): net.Socket {
    const policies = policiesInForce();
    if (policies.length === 0) return connect.apply(this, args);
    const { options, callback } = normalizeConnectArgs(args);
    // Node defaults a missing host to localhost; write it back so the checks
    // and the guarded lookup below both see what will be dialled.
    if (typeof options.path !== "string" && !options.host) {
      options.host = "localhost";
    }
    const denied = denyReason(policies, options);
    if (denied) {
      process.nextTick(() => this.destroy(denied));
      return this;
    }
    if (typeof options.host === "string" && !isIP(options.host)) {
      options.lookup = guardedLookup(
        policies,
        options.host,
        options.port === undefined ? undefined : Number(options.port),
      );
    }
    return connect.call(this, options, callback);
  }
  seal(net.Socket.prototype, "connect", patchedConnect);

  // The dgram surface carries no destination a policy can usefully allow — a
  // piece's work is HTTP — so it is refused whole, as is c-ares further down.
  const send = originalOf<(this: dgram.Socket, ...args: unknown[]) => void>(
    dgram.Socket.prototype,
    "send",
  );
  function patchedSend(this: dgram.Socket, ...args: unknown[]): void {
    if (policiesInForce().length === 0) {
      send.apply(this, args);
      return;
    }
    const host = args.find(
      (arg, index) => index > 0 && typeof arg === "string",
    ) as string | undefined;
    const last = args[args.length - 1];
    failLater(
      this,
      new EgressDeniedError(
        `UDP to "${host ?? "the requested address"}" is not permitted`,
        { host: host ?? "" },
      ),
      typeof last === "function" ? last : undefined,
    );
  }
  seal(dgram.Socket.prototype, "send", patchedSend);

  // Inbound is refused for the same reason: a delivery reaches a workflow
  // through the host's webhook endpoint, never a port the piece opened.
  const bind = originalOf<
    (this: dgram.Socket, ...args: unknown[]) => dgram.Socket
  >(dgram.Socket.prototype, "bind");
  function patchedBind(this: dgram.Socket, ...args: unknown[]): dgram.Socket {
    if (policiesInForce().length === 0) return bind.apply(this, args);
    failLater(
      this,
      new EgressDeniedError("binding a UDP socket is not permitted", {
        host: "",
      }),
      undefined,
    );
    return this;
  }
  seal(dgram.Socket.prototype, "bind", patchedBind);

  const listen = originalOf<
    (this: net.Server, ...args: unknown[]) => net.Server
  >(net.Server.prototype, "listen");
  function patchedListen(this: net.Server, ...args: unknown[]): net.Server {
    if (policiesInForce().length === 0) return listen.apply(this, args);
    failLater(
      this,
      new EgressDeniedError("listening for connections is not permitted", {
        host: "",
      }),
      undefined,
    );
    return this;
  }
  seal(net.Server.prototype, "listen", patchedListen);

  // The four objects a piece can reach c-ares through; dns.lookup is
  // getaddrinfo and stays open, guarded per connect instead.
  refuseResolvers(dns, false);
  refuseResolvers(dns.Resolver.prototype, false);
  refuseResolvers(dns.promises, true);
  refuseResolvers(dns.promises.Resolver.prototype, true);
}

// True for a denial raised in the child, including one a piece's client
// re-wrapped: axios copies `code`, undici keeps the original as `cause`.
export function isEgressDenied(error: unknown): boolean {
  const seen = new Set<unknown>();
  let candidate: unknown = error;
  // Wrappers nest, and some of them produce a cycle; the walk is bounded by
  // the seen set and by a depth no honest chain reaches.
  for (let depth = 0; depth < 16; depth++) {
    if (candidate instanceof EgressDeniedError) return true;
    if (typeof candidate !== "object" || candidate === null) return false;
    if (seen.has(candidate)) return false;
    seen.add(candidate);
    const fields = candidate as {
      name?: unknown;
      code?: unknown;
      message?: unknown;
      cause?: unknown;
      properties?: { code?: unknown };
      serialized?: { name?: unknown; properties?: { code?: unknown } };
    };
    const codes = [
      fields.code,
      fields.properties?.code,
      fields.serialized?.properties?.code,
    ];
    if (codes.includes(EGRESS_DENIED_CODE)) return true;
    if (fields.name === "EgressDeniedError") return true;
    if (fields.serialized?.name === "EgressDeniedError") return true;
    if (
      typeof fields.message === "string" &&
      fields.message.includes("Egress denied:")
    ) {
      return true;
    }
    candidate = fields.cause;
  }
  return false;
}
