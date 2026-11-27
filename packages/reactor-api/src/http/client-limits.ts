import type { IncomingMessage } from "node:http";
import { isIP } from "node:net";

/**
 * Who a public route's limits are charged to, and the counters that charge
 * them. The client is the socket's address, unless the host says a proxy it
 * trusts is in front (`trustProxy`, which the host sets only with a
 * configured PUBLIC_URL): then it is the right-most hop of `X-Forwarded-For`
 * that is no proxy of the deployment's own (loopback, private or
 * link-local), as entries left of it are the caller's to write. An IPv6
 * client is counted by its /64 ({@link limitKey}).
 */

/** `::ffff:1.2.3.4` as `1.2.3.4`; a port or brackets dropped; undefined for no address. */
function normalized(value: string | undefined): string | undefined {
  let address = value?.trim();
  if (!address) return undefined;
  const bracketed = /^\[([^\]]+)\](?::\d+)?$/.exec(address);
  if (bracketed) address = bracketed[1];
  else if (/^\d{1,3}(\.\d{1,3}){3}:\d+$/.test(address)) {
    address = address.slice(0, address.lastIndexOf(":"));
  }
  address = address.toLowerCase();
  if (address.startsWith("::ffff:") && isIP(address.slice(7)) === 4) {
    address = address.slice(7);
  }
  return isIP(address) === 0 ? undefined : address;
}

/** Whether `address` is one a deployment's own proxies sit on. */
function isInternal(address: string): boolean {
  if (isIP(address) === 4) {
    const [a, b] = address.split(".").map(Number);
    return (
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    );
  }
  return (
    address === "::1" ||
    /^f[cd][0-9a-f]{2}:/.test(address) ||
    /^fe[89ab][0-9a-f]:/.test(address)
  );
}

/**
 * The requesting client's address. With `trustProxy`, a hop list of only
 * internal addresses (a deployment on a private network) names its farthest.
 * The header is read only from an internal peer: a caller that reaches the
 * host from outside wrote any header it sends itself.
 */
export function clientAddress(
  req: Pick<IncomingMessage, "headers" | "socket">,
  trustProxy: boolean,
): string {
  const socket = normalized(req.socket.remoteAddress) ?? "unknown";
  if (!trustProxy || !isInternal(socket)) return socket;
  const header = req.headers["x-forwarded-for"];
  const hops = (Array.isArray(header) ? header.join(",") : (header ?? ""))
    .split(",")
    .map((hop) => normalized(hop))
    .filter((hop): hop is string => hop !== undefined);
  if (hops.length === 0) return socket;
  for (let i = hops.length - 1; i >= 0; i--) {
    if (!isInternal(hops[i])) return hops[i];
  }
  return hops[0];
}

/** The first 64 bits of an IPv6 address, as four hextets without leading zeros. */
function prefix64(address: string): string {
  const bare = withoutZone(address);
  const [head, tail] = bare.split("::", 2);
  const groupsOf = (part: string | undefined) => (part ? part.split(":") : []);
  const left = groupsOf(head);
  const right = groupsOf(tail);
  // A dotted IPv4 tail holds two hextets' worth.
  const width = (parts: string[]) =>
    parts.reduce((n, part) => n + (part.includes(".") ? 2 : 1), 0);
  const zeros = tail === undefined ? 0 : 8 - width(left) - width(right);
  return [...left, ...Array<string>(Math.max(0, zeros)).fill("0"), ...right]
    .slice(0, 4)
    .map((group) => parseInt(group, 16).toString(16))
    .join(":");
}

/**
 * What a client's limits are counted under: its address, or an IPv6
 * address's /64. One subscriber or host holds a whole /64 and may write any
 * of its addresses, so counting each would make every limit endless.
 */
export function limitKey(client: string): string {
  return isIP(withoutZone(client)) === 6
    ? `${prefix64(client.toLowerCase())}::/64`
    : client;
}

/** `fe80::1%eth0` as `fe80::1`. */
function withoutZone(address: string): string {
  const at = address.indexOf("%");
  return at === -1 ? address : address.slice(0, at);
}

/** How many clients a counter keeps at most: past it, a new client is refused. */
const MAX_CLIENTS = 10_000;
const WINDOW_MS = 60_000;

/**
 * Counts per client ({@link limitKey}) and minute; the returned check is
 * true once a client is over `limit`. Ended windows are dropped as they go; a
 * full table refuses a client it holds no count for rather than forget the
 * others' counts.
 */
export function perMinuteLimit(
  limit: number,
  now: () => number,
  maxClients = MAX_CLIENTS,
): (client: string) => boolean {
  // Insertion order is window order: a window that restarts moves to the end.
  const counts = new Map<string, { start: number; count: number }>();
  return (client) => {
    const at = now();
    for (const [key, held] of counts) {
      if (at - held.start < WINDOW_MS) break;
      counts.delete(key);
    }
    const key = limitKey(client);
    const held = counts.get(key);
    if (held) {
      held.count++;
      return held.count > limit;
    }
    if (counts.size >= maxClients) return true;
    counts.set(key, { start: at, count: 1 });
    return false;
  };
}
