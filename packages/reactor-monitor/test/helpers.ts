import { MessageChannel } from "node:worker_threads";
import type { ManagedReactor, ReactorDescriptor } from "../src/index.js";
import type { MessagePortLike } from "@powerhousedao/reactor";
import type { DocumentDriveDocument } from "@powerhousedao/shared/document-drive";

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

/** The drive's folder names, read through `reactor.client`; `[]` if it is not there yet. */
export async function folderNames(
  reactor: ManagedReactor,
  driveId: string,
): Promise<string[]> {
  try {
    const drive = await reactor.client.get<DocumentDriveDocument>(driveId);
    return drive.state.global.nodes.map((node) => node.name);
  } catch {
    return [];
  }
}

/** Distinct from "the drive is here but empty", which `folderNames` cannot tell apart. */
export async function hasDrive(
  reactor: ManagedReactor,
  driveId: string,
): Promise<boolean> {
  try {
    await reactor.client.get(driveId);
    return true;
  } catch {
    return false;
  }
}

/** Waits plainly; used to prove a settled op count stays settled. */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
