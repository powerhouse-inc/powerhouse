// Connect owns the path (`/d/<drive>/<node>`) for an open editor; the studio's
// sidebar selection lives in the hash, so it survives a refresh.
import { useCallback, useEffect, useState } from "react";

function readHash(): string | undefined {
  return window.location.hash.replace(/^#/, "") || undefined;
}

export type Select = (id?: string, options?: { replace?: boolean }) => void;

// Each selection is a history entry, so back and forward walk the studio;
// `replace` is for corrections and for riding on an entry Connect just pushed.
export function useHashSelection(): [string | undefined, Select] {
  const [selected, setSelected] = useState<string | undefined>(readHash);

  useEffect(() => {
    // Covers back/forward and a hand-edited URL.
    const sync = () => setSelected(readHash());
    window.addEventListener("hashchange", sync);
    window.addEventListener("popstate", sync);
    return () => {
      window.removeEventListener("hashchange", sync);
      window.removeEventListener("popstate", sync);
    };
  }, []);

  const select = useCallback<Select>((id, options) => {
    setSelected(id);
    const url = new URL(window.location.href);
    url.hash = id ?? "";
    if (url.href === window.location.href) return;
    if (options?.replace) window.history.replaceState(null, "", url);
    else window.history.pushState(null, "", url);
  }, []);

  return [selected, select];
}
