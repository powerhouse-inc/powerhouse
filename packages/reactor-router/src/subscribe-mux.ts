import type {
  DocumentChangeEvent,
  SearchFilter,
  ViewFilter,
} from "@powerhousedao/reactor";
import type { RouterBackend } from "./backend.js";
import { messageOf, rethrow } from "./errors.js";
import type { RouterDiagnostic } from "./types.js";

/** Two backends' copies of one change share this key. */
export function changeKey(event: DocumentChangeEvent): string {
  const documents = event.documents
    .map(
      (document) =>
        `${document.header.id}@${JSON.stringify(document.header.revision)}@${document.header.lastModifiedAtUtcIso}`,
    )
    .join(",");
  const context = event.context ?? {};
  return `${event.type}|${documents}|${context.parentId ?? ""}|${context.childId ?? ""}|${context.purged === true ? "purged" : ""}`;
}

/** Delivers each change once across backends; dedup memory is `dedupSize`. */
export function subscribeAll(
  backends: readonly RouterBackend[],
  search: SearchFilter,
  callback: (event: DocumentChangeEvent) => void,
  view: ViewFilter | undefined,
  dedupSize: number,
  onDiagnostic: RouterDiagnostic,
): () => void {
  const seen = new Set<string>();
  const order: string[] = [];
  const deliver = (event: DocumentChangeEvent): void => {
    const key = changeKey(event);
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    order.push(key);
    if (order.length > dedupSize) {
      const oldest = order.shift();
      if (oldest !== undefined) {
        seen.delete(oldest);
      }
    }
    callback(event);
  };

  const unsubscribes: (() => void)[] = [];
  const failures: unknown[] = [];
  for (const backend of backends) {
    try {
      unsubscribes.push(backend.api.subscribe(search, deliver, view));
    } catch (error) {
      failures.push(error);
      onDiagnostic(
        `subscribe: backend ${backend.name} refused the subscription (${messageOf(error)})`,
        error,
      );
    }
  }
  if (unsubscribes.length === 0 && failures.length > 0) {
    rethrow(failures[0]);
  }
  return () => {
    for (const unsubscribe of unsubscribes) {
      try {
        unsubscribe();
      } catch (error) {
        onDiagnostic(`unsubscribe failed (${messageOf(error)})`, error);
      }
    }
  };
}
