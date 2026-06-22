import type { IReactorClient } from "@powerhousedao/reactor";
import { createReactorClientProxy } from "./client-proxy.js";
import type { ReactorIdentity, VersionFingerprint } from "./protocol.js";
import type { IRpcTransport } from "./transport.js";

export type ReactorHello = {
  version: VersionFingerprint;
  construct?: unknown;
  packages?: string[];
};

export function connectReactorClient(
  transport: IRpcTransport,
  hello: ReactorHello,
  onReload?: (reason: string) => void,
): IReactorClient {
  const client = createReactorClientProxy(transport, { onReload });
  transport.post({
    k: "hello",
    id: "hello",
    version: hello.version,
    construct: hello.construct,
    packages: hello.packages,
  });
  return client;
}

// Push the current renown identity (null on logout) to the worker; re-send on login/logout.
export function postReactorIdentity(
  transport: IRpcTransport,
  user: ReactorIdentity | null,
): void {
  transport.post({ k: "identity", user });
}
