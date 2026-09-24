// Two seams the egress guard captures when it loads, so this module must be
// imported before it: a DNS answer the tests can mock, and a connect they can watch.
import dns from "node:dns";
import net from "node:net";

type LookupAnswer = string | dns.LookupAddress[];
type LookupCallback = (
  error: NodeJS.ErrnoException | null,
  address?: LookupAnswer,
  family?: number,
) => void;

const realLookup = dns.lookup;
const realPromisesLookup = dns.promises.lookup;

// A mocked answer is always the full record list, as upstream's guard asks for
// it; getaddrinfo answers a caller that did not ask for `all` with the first.
function deliver(
  options: { all?: boolean },
  callback: LookupCallback,
): LookupCallback {
  return (error, address, family) => {
    if (error || !Array.isArray(address) || options.all) {
      callback(error, address, family);
      return;
    }
    callback(null, address[0]?.address, address[0]?.family);
  };
}

function lookupSeam(
  hostname: string,
  options: dns.LookupOptions,
  callback: LookupCallback,
): void {
  const answer = deliver(options, callback);
  // vi.spyOn replaces these properties; the guard only ever holds this seam.
  const mockedCallback = dns.lookup as unknown;
  if (mockedCallback !== lookupSeam) {
    (mockedCallback as typeof lookupSeam)(hostname, options, answer);
    return;
  }
  if (dns.promises.lookup !== realPromisesLookup) {
    dns.promises
      .lookup(hostname, { ...options, all: true })
      .then((records) => answer(null, records as unknown as LookupAnswer))
      .catch((error: NodeJS.ErrnoException) => answer(error));
    return;
  }
  (realLookup as unknown as typeof lookupSeam)(hostname, options, callback);
}
(dns as { lookup: unknown }).lookup = lookupSeam;

export interface ConnectCall {
  host?: string;
  lookup?: unknown;
}

// A socket registered here never dials: the guard's connect hands the options
// it would have used to the probe instead.
export const connectProbes = new WeakMap<
  net.Socket,
  (options: ConnectCall) => void
>();

const realConnect = Reflect.get(net.Socket.prototype, "connect") as (
  ...args: unknown[]
) => net.Socket;
function connectSeam(this: net.Socket, ...args: unknown[]): net.Socket {
  const probe = connectProbes.get(this);
  if (!probe) {
    return realConnect.apply(this, args);
  }
  probe(args[0] as ConnectCall);
  return this;
}
net.Socket.prototype.connect =
  connectSeam as typeof net.Socket.prototype.connect;
