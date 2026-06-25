import type {
  IDocumentModelRegistry,
  IReactorClient,
} from "@powerhousedao/reactor";
import { createReactorClientProxy } from "./client-proxy.js";
import type { MessageRouter } from "./message-router.js";
import type { ReactorIdentity, VersionFingerprint } from "./protocol.js";

export type ReactorHello = {
  version: VersionFingerprint;
  construct?: unknown;
  packages?: string[];
};

export function connectReactorClient(
  router: MessageRouter,
  hello: ReactorHello,
  onReload?: (reason: string, workerGen?: string) => void,
  registry?: IDocumentModelRegistry,
): IReactorClient {
  const client = createReactorClientProxy(router, { onReload, registry });
  router.post({
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
  router: MessageRouter,
  user: ReactorIdentity | null,
): void {
  router.post({ k: "identity", user });
}
