import { MessageChannel } from "node:worker_threads";
import type { ReactorDescriptor } from "../src/index.js";
import type { MessagePortLike } from "@powerhousedao/reactor";

/**
 * An in-memory, in-process reactor descriptor, so a test reactor leaves
 * nothing behind. `idb://` is the browser default and has no backing store
 * in node. `overrides` is shallow-merged over the defaults so a test can add
 * `sync`, `documentModelModules`, etc. without repeating the base shape.
 */
export function descriptor(
  name: string,
  overrides?: Partial<ReactorDescriptor>,
): ReactorDescriptor {
  return {
    kind: "in-process",
    name,
    storage: { kind: "memory" },
    ...overrides,
  };
}

/**
 * A `node:worker_threads` MessageChannel in place of the browser global: the
 * in-process path has no browser dependency. `unref()` lets the test process
 * exit without waiting on the ports.
 */
export function nodeChannel(): {
  port1: MessagePortLike;
  port2: MessagePortLike;
} {
  const { port1, port2 } = new MessageChannel();
  port1.unref();
  port2.unref();
  return {
    port1: port1 as unknown as MessagePortLike,
    port2: port2 as unknown as MessagePortLike,
  };
}
