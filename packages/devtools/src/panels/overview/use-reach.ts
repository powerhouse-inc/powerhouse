import { useEffect, useState } from "react";

export type Reach = "checking" | "up" | "down";

const PROBE_MS = 5000;
const PROBE_TIMEOUT_MS = 3000;

/** Whether anything answers at the URL. `no-cors` gives an opaque response,
 * which is enough to know the port is served. */
export function useReach(url: string | null | undefined): Reach {
  const [probed, setProbed] = useState<{ url: string; reach: Reach }>();
  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    let timer: number | undefined;
    const probe = async () => {
      if (document.visibilityState !== "hidden") {
        const controller = new AbortController();
        const timeout = window.setTimeout(
          () => controller.abort(),
          PROBE_TIMEOUT_MS,
        );
        let next: Reach;
        try {
          await fetch(url, {
            method: "HEAD",
            mode: "no-cors",
            cache: "no-store",
            signal: controller.signal,
          });
          next = "up";
        } catch {
          next = "down";
        } finally {
          window.clearTimeout(timeout);
          // Closes a response that streams, such as an MCP event stream.
          controller.abort();
        }
        if (cancelled) return;
        setProbed({ url, reach: next });
      }
      timer = window.setTimeout(() => void probe(), PROBE_MS);
    };
    void probe();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [url]);
  return probed && probed.url === url ? probed.reach : "checking";
}
