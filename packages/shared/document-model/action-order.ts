import type { SynthesizedIdForm, TieOrder } from "./base-reducer-protocol.js";
import { hashBrowser } from "./crypto.js";

/** Compares two ids: action ids, then operation ids. */
export type IdOrder = (a: string, b: string) => number;

/** Code unit, locale-free; one process's v7 ids sort in creation order. */
export const compareActionIds: IdOrder = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/** Base-reducer 1 and 2 order, which depends on the default locale. */
export const legacyIdOrder: IdOrder = (a, b) => a.localeCompare(b);

/** A versionless document is legacy. */
export function idOrderFor(tieOrder: TieOrder | undefined): IdOrder {
  switch (tieOrder) {
    case "canonical":
      return compareActionIds;
    case "rank-locale":
    case undefined:
      return legacyIdOrder;
    default: {
      const unhandled: never = tieOrder;
      throw new Error(`Unknown tie order: ${String(unhandled)}`);
    }
  }
}

export type CanonicalKey = {
  id: string;
  timestampUtcMs: string;
  action?: { id?: string };
};

/** Base-reducer 3: timestamp, then action id, then operation id. */
export function compareCanonical(a: CanonicalKey, b: CanonicalKey): number {
  return (
    Date.parse(a.timestampUtcMs) - Date.parse(b.timestampUtcMs) ||
    compareActionIds(a.action?.id ?? "", b.action?.id ?? "") ||
    compareActionIds(a.id, b.id)
  );
}

/** `<v7 id>~ug:<group>`: the id leads, so it sorts by creation. */
export const UNDO_GROUP_MARK = "~ug:";
/** Parsed only: ids stored before the mark, `undo-group:<group>:<id>`. */
export const LEGACY_UNDO_GROUP_PREFIX = "undo-group:";

export function groupedActionId(id: string, group: string): string {
  return `${id}${UNDO_GROUP_MARK}${group}`;
}

/** The undo group an action id carries, in either form. */
export function undoGroupOfId(id: string): string | undefined {
  if (id.startsWith(LEGACY_UNDO_GROUP_PREFIX)) {
    const end = id.indexOf(":", LEGACY_UNDO_GROUP_PREFIX.length);
    return end > LEGACY_UNDO_GROUP_PREFIX.length
      ? id.slice(LEGACY_UNDO_GROUP_PREFIX.length, end)
      : undefined;
  }
  const at = id.indexOf(UNDO_GROUP_MARK);
  return at > 0 && at + UNDO_GROUP_MARK.length < id.length
    ? id.slice(at + UNDO_GROUP_MARK.length)
    : undefined;
}

/** The sha1 form released v1/v2 stores hold; v3 synthesizes nothing. */
export function synthesizedActionId(
  submittedId: string,
  form: SynthesizedIdForm,
): string {
  switch (form) {
    case "hashed":
      return hashBrowser(`synthesized:${submittedId}`, "sha1", "hex").slice(
        0,
        32,
      );
    case "none":
      throw new Error(
        `Action ${submittedId} cannot synthesize: its base reducer refuses a submitted UNDO or REDO`,
      );
    default: {
      const unhandled: never = form;
      throw new Error(`Unknown synthesized id form: ${String(unhandled)}`);
    }
  }
}
