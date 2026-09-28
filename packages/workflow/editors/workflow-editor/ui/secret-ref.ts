// The connection editor's secret flow: the input takes the VALUE and only the
// minted ref is committed. Pasting over an existing ref rotates it.
import { useEffect, useState } from "react";
import type { SecretFormService, SecretStat } from "./forms.js";

export const SECRET_REF_PREFIX = "secret://v1:";

export function useSecretRef(options: {
  value: unknown;
  secrets?: SecretFormService;
  label: string;
  onCommit: (ref: string) => void;
}) {
  const { secrets } = options;
  const ref = typeof options.value === "string" ? options.value : "";
  const managed = ref.startsWith(SECRET_REF_PREFIX);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stat, setStat] = useState<SecretStat | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks-extra/set-state-in-effect -- clears the stale stat before the ref's own fetch
    setStat(null);
    if (!managed || !secrets) return;
    let cancelled = false;
    secrets.stat(ref).then(
      (result) => {
        if (!cancelled) setStat(result);
      },
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
  }, [ref, managed, secrets]);

  const commit = () => {
    if (draft === "" || busy || !secrets) return;
    setBusy(true);
    setError(null);
    secrets
      .save({
        ref: managed ? ref : undefined,
        value: draft,
        label: options.label,
      })
      .then((result) => {
        setDraft("");
        if (result.ref !== ref) options.onCommit(result.ref);
        else setStat(result);
      })
      .catch((requestError: unknown) => {
        setError(
          requestError instanceof Error
            ? requestError.message
            : String(requestError),
        );
      })
      .finally(() => setBusy(false));
  };

  return { ref, managed, draft, setDraft, busy, error, stat, commit };
}
