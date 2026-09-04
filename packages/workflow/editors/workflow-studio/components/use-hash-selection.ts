// Connect owns the path (`/d/<drive>/<node>`) for an open editor; the studio's
// sidebar selection lives in the hash, so it survives a refresh.
import { useCallback, useEffect, useState } from "react";

function readHash(): string | undefined {
  return window.location.hash.replace(/^#/, "") || undefined;
}

export function useHashSelection(): [
  string | undefined,
  (id?: string) => void,
] {
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

  const select = useCallback((id?: string) => {
    setSelected(id);
    // Replaced, not pushed: Connect pushes a path entry on the same click, and
    // two history entries per click breaks the back button.
    const url = new URL(window.location.href);
    url.hash = id ?? "";
    window.history.replaceState(null, "", url);
  }, []);

  return [selected, select];
}
