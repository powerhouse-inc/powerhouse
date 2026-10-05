// Upstream's ssrfGuard over our egress guard (worker/egress.ts). Ours hooks
// connect, not dns.lookup, so a lookup here is the one a socket would make.
import { connectProbes, type ConnectCall } from "./net-seams.js";
import type dns from "node:dns";
import net from "node:net";
import { runWithEgressPolicy } from "../../src/pieces/activepieces/worker/egress.js";

interface InstallOptions {
  enabled: boolean;
  allowList?: string[];
  allowedLoopbackPorts?: number[];
}

let release: (() => void) | undefined;

// A policy stays in force for as long as the request holding it is pending.
function install({ enabled, allowList = [] }: InstallOptions): void {
  uninstall();
  if (!enabled) return;
  void runWithEgressPolicy(
    { allowAddresses: allowList },
    () =>
      new Promise<void>((resolve) => {
        release = resolve;
      }),
  );
}

function uninstall(): void {
  release?.();
  release = undefined;
}

// The guard is asked the only way it answers: a connect it either refuses or
// hands on to Node. This one never dials.
function isBlockedIp(ip: string): boolean {
  const socket = new net.Socket();
  socket.on("error", () => undefined);
  let reached = false;
  connectProbes.set(socket, () => {
    reached = true;
  });
  socket.connect({ host: ip, port: 443 });
  socket.destroy();
  return !reached;
}

export const ssrfGuard = {
  install,
  uninstall,
  isBlockedIp,
  isEnabled: () => release !== undefined,
};

type Answer = dns.LookupAddress | dns.LookupAddress[];
type GuardedLookup = (
  hostname: string,
  options: dns.LookupOptions,
  callback: (
    error: Error | null,
    address?: string | dns.LookupAddress[],
    family?: number,
  ) => void,
) => void;

// What the guard lets a socket dial for `hostname`: the first record, or with
// `all` every record the policy permits.
function resolveThroughGuard(
  hostname: string,
  options: dns.LookupOptions = {},
): Promise<Answer> {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    socket.once("error", reject);
    connectProbes.set(socket, (call: ConnectCall) => {
      socket.destroy();
      if (typeof call.lookup !== "function") {
        resolve({
          address: call.host ?? "",
          family: net.isIP(call.host ?? ""),
        });
        return;
      }
      (call.lookup as GuardedLookup)(
        call.host ?? hostname,
        { family: options.family, all: options.all },
        (error, address, family) => {
          if (error) reject(error);
          else if (Array.isArray(address)) resolve(address);
          else resolve({ address: address ?? "", family: family ?? 0 });
        },
      );
    });
    socket.connect({ host: hostname, port: 443 });
  });
}

type LookupCallback = (
  error: Error | null,
  address?: string | dns.LookupAddress[],
  family?: number,
) => void;

function lookup(hostname: string, callback: LookupCallback): void;
function lookup(
  hostname: string,
  options: dns.LookupOptions,
  callback: LookupCallback,
): void;
function lookup(
  hostname: string,
  optionsOrCallback: dns.LookupOptions | LookupCallback,
  maybeCallback?: LookupCallback,
): void {
  const options =
    typeof optionsOrCallback === "function" ? {} : optionsOrCallback;
  const callback =
    typeof optionsOrCallback === "function" ? optionsOrCallback : maybeCallback;
  resolveThroughGuard(hostname, options).then(
    (answer) =>
      Array.isArray(answer)
        ? callback?.(null, answer)
        : callback?.(null, answer.address, answer.family),
    (error: Error) => callback?.(error),
  );
}

function lookupPromise(
  hostname: string,
  options: dns.LookupAllOptions,
): Promise<dns.LookupAddress[]>;
function lookupPromise(
  hostname: string,
  options?: dns.LookupOneOptions,
): Promise<dns.LookupAddress>;
function lookupPromise(
  hostname: string,
  options?: dns.LookupOptions,
): Promise<Answer> {
  return resolveThroughGuard(hostname, options);
}

// dns.lookup's two faces, answered through the guard.
export const guardedDns = { lookup, promises: { lookup: lookupPromise } };
