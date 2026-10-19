// The child's seam for `ctx.reactor`. The worker entry outside this layer
// installs the reactor RPC client; this layer imports no reactor code.
import type {
  ReactorClientFor,
  RequireReactor,
} from "@powerhousedao/pieces-framework";
import type { ReactorRequestBinding } from "./protocol.js";

// The piece's ctx.reactor, typed by the block's declaration.
export type WorkerReactorSession = {
  [R in RequireReactor]: {
    readonly requireReactor: R;
    readonly client: ReactorClientFor<R>;
    // Run when the request settles; later calls throw ReactorRequestClosedError.
    close(): void;
  };
}[RequireReactor];

export type WorkerReactorProvider = (
  binding: ReactorRequestBinding,
  requireReactor: RequireReactor,
) => Promise<WorkerReactorSession>;

let provider: WorkerReactorProvider | undefined;

export function installReactorProvider(next: WorkerReactorProvider): void {
  provider = next;
}

// A session only when the host serves the request and the block declares access.
export function openWorkerReactor(
  binding: ReactorRequestBinding | undefined,
  declared: unknown,
): Promise<WorkerReactorSession | undefined> {
  if (!binding || !provider) return Promise.resolve(undefined);
  if (declared !== "read" && declared !== "write") {
    return Promise.resolve(undefined);
  }
  return provider(binding, declared);
}
