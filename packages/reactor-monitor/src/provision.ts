import { provisionInProcess } from "./in-process.js";
import type { ManagedReactor, ReactorDescriptor } from "./types.js";
import {
  provisionWorkerReactor,
  type ProvisionWorkerOptions,
} from "./worker/client.js";

export type ProvisionOptions = ProvisionWorkerOptions;

/**
 * Provisions a reactor matching `descriptor` and returns the handle the
 * monitor drives it through.
 *
 * `worker` hosts the reactor in a SharedWorker named after the descriptor and
 * reaches it over RPC; `in-process` builds it on the calling thread. Both
 * namespace their store by `descriptor.name`, so provisioning N descriptors
 * gives N independent reactors in one origin.
 *
 * `remote` is not implemented: attaching an already-running reactor over
 * HTTP/GraphQL needs the remote inspection surface from stage 3 (W3.1/W3.2).
 */
export function provision(
  descriptor: ReactorDescriptor,
  options: ProvisionOptions = {},
): Promise<ManagedReactor> {
  switch (descriptor.kind) {
    case "in-process":
      return provisionInProcess(descriptor);
    case "worker":
      try {
        return Promise.resolve(provisionWorkerReactor(descriptor, options));
      } catch (error) {
        return Promise.reject(error as Error);
      }
    case "remote":
      return Promise.reject(
        new Error(
          `NotImplemented: provision() for reactor kind "remote" lands in W3.1 (attach over the existing GQL channels) and W3.2 (remote IInspector)`,
        ),
      );
    default: {
      const kind: never = descriptor.kind;
      return Promise.reject(
        new Error(`Unknown reactor kind: ${JSON.stringify(kind)}`),
      );
    }
  }
}
