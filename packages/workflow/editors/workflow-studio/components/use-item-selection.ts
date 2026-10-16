// Connect owns the path (`/d/<drive>/<node>`) for an open editor; the studio's
// sidebar selection is the `item` query param, so it survives a refresh.
import {
  useSearchParams,
  useSetSearchParams,
  useSetSelectedNode,
} from "@powerhousedao/reactor-browser";
import { useCallback, useEffect } from "react";
import { ITEM_PARAM } from "../../shared/url-param.js";

export { ITEM_PARAM };

export type Select = (id?: string, options?: { replace?: boolean }) => void;
export type Go = (id: string | undefined, editor?: string) => void;

// Links from before the query param kept the selection in the hash.
function readLegacyHash(): string | undefined {
  if (typeof window === "undefined") return undefined;
  return window.location.hash.replace(/^#/, "") || undefined;
}

/** The selected item, a setter, and `go`, which also opens or closes the item's
 * editor; each is one history entry, so back and forward walk the studio. */
export function useItemSelection(
  openEditorId: string | undefined,
): [string | undefined, Select, Go] {
  const params = useSearchParams();
  const setParams = useSetSearchParams();
  const setSelectedNode = useSetSelectedNode();
  const selected = params[ITEM_PARAM] || undefined;

  const select = useCallback<Select>(
    (id, options) => {
      if (id === selected) return;
      setParams({ [ITEM_PARAM]: id }, options);
    },
    [selected, setParams],
  );

  // An editor change navigates once, with the selection in the same entry.
  const go = useCallback<Go>(
    (id, editor) => {
      if ((editor ?? null) === (openEditorId ?? null)) {
        select(id);
        return;
      }
      setSelectedNode(editor, { search: { [ITEM_PARAM]: id } });
    },
    [openEditorId, select, setSelectedNode],
  );

  // Moves a legacy hash selection into the query param once, on mount.
  useEffect(() => {
    const legacy = readLegacyHash();
    if (legacy && !selected) {
      setParams({ [ITEM_PARAM]: legacy }, { replace: true });
    }
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- mount only
  }, []);

  return [selected, select, go];
}
