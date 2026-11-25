import type {
  IDocumentModelRegistry,
  IReactorClient,
} from "@powerhousedao/reactor";
import {
  createReactorClientProxy,
  type MessageRouter,
  type ReactorIdentity,
  type VersionFingerprint,
} from "@powerhousedao/reactor/rpc";

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

/** Who the worker signs as, and the credential its bearers carry (F3d). */
export type ReactorSessionIdentity = ReactorIdentity & {
  /** The user's credential: renown's `PowerhouseVerifiableCredential`. */
  credential?: unknown;
};

// Push the current renown identity (null on logout) to the worker; re-send on login/logout.
export function postReactorIdentity(
  router: MessageRouter,
  user: ReactorSessionIdentity | null,
): void {
  router.post({ k: "identity", user });
}
