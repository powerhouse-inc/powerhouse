// Editor view state kept in the URL's query params through the host navigation,
// so it survives a refresh and is dropped when the document is left.
import type { PHSearchUpdate } from "@powerhousedao/reactor-browser";
import {
  useSearchParams,
  useSetSearchParams,
} from "@powerhousedao/reactor-browser";
import { useCallback, useEffect, useRef, useState } from "react";

/** The studio's sidebar selection. */
export const ITEM_PARAM = "item";

export type SetParam<T extends string> = (
  value: T,
  options?: { replace?: boolean; also?: PHSearchUpdate },
) => void;

/** A query param read as one of `allowed`, else `fallback`; the fallback is
 * kept out of the URL. `also` updates other params in the same entry. */
export function useSearchParam<T extends string>(
  key: string,
  fallback: T,
  allowed?: readonly T[],
): [T, SetParam<T>] {
  const params = useSearchParams();
  const setParams = useSetSearchParams();
  const raw = params[key] as string | undefined;
  const value =
    raw !== undefined && (!allowed || allowed.includes(raw as T))
      ? (raw as T)
      : fallback;

  const set = useCallback<SetParam<T>>(
    (next, options) => {
      if (next === value && !options?.also) return;
      setParams(
        { ...options?.also, [key]: next === fallback ? undefined : next },
        { replace: options?.replace },
      );
    },
    [key, fallback, value, setParams],
  );
  return [value, set];
}

/** A text param with a local draft, so typing never waits on a navigation;
 * the draft follows other URL changes, e.g. back and forward. */
export function useSearchParamDraft(
  key: string,
): [string, (value: string) => void] {
  const [param, setParam] = useSearchParam<string>(key, "");
  const [draft, setDraft] = useState(param);
  // Values written from the draft, in order; their arrival in the URL is no
  // change, and drops those written before it that the URL skipped.
  const written = useRef<string[]>([]);

  useEffect(() => {
    const index = written.current.indexOf(param);
    written.current = index === -1 ? [] : written.current.slice(index + 1);
    if (index === -1) setDraft(param);
  }, [param]);

  const set = useCallback(
    (value: string) => {
      setDraft(value);
      if (value === param) return;
      written.current.push(value);
      setParam(value, { replace: true });
    },
    [param, setParam],
  );
  return [draft, set];
}
