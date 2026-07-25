import {
  createAttachmentClient,
  type AttachmentDownloadInput,
  type AttachmentHeader,
  type IAttachmentClient,
  type PreprocessResult,
} from "@powerhousedao/reactor-attachments/client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAttachmentService } from "./attachment-service.js";

/** Returns an IAttachmentClient wrapping the current IAttachmentService, or undefined if none is set. */
export function useAttachments(): IAttachmentClient | undefined {
  const service = useAttachmentService();
  return useMemo(
    () => (service ? createAttachmentClient(service) : undefined),
    [service],
  );
}

export type UseAttachmentPreviewInput = {
  documentId: string;
  /** Pass null/undefined to render nothing (the hook stays idle). */
  ref: AttachmentDownloadInput["ref"] | null | undefined;
  /**
   * How many times a failed attempt is retried before the hook settles on
   * error. Retrying matters because a freshly attached ref is not
   * immediately downloadable: the server's reference index authorizes
   * downloads and only learns the (document, ref) pair once the operation
   * has synced and been projected. Defaults to 3.
   */
  retries?: number;
  /** Fixed delay between attempts, in milliseconds. Defaults to 3000. */
  retryDelayMs?: number;
};

const DEFAULT_PREVIEW_RETRIES = 3;
const DEFAULT_PREVIEW_RETRY_DELAY_MS = 3_000;

export type UseAttachmentPreviewReturn = {
  /** Object URL ready for img/iframe/video src; undefined while loading or on error. */
  url: string | undefined;
  header: AttachmentHeader | undefined;
  loading: boolean;
  error: Error | undefined;
};

/**
 * Document-authorized inline preview of an attachment. Downloads the bytes
 * through the normal authorized flow, exposes them as an object URL, and
 * revokes it automatically on unmount and whenever documentId/ref change —
 * editors never touch blobs or URL lifecycles. Failed attempts are retried
 * (`retries` × `retryDelayMs`) so a preview requested right after attaching
 * appears as soon as the server's reference index catches up.
 */
export function useAttachmentPreview({
  documentId,
  ref,
  retries = DEFAULT_PREVIEW_RETRIES,
  retryDelayMs = DEFAULT_PREVIEW_RETRY_DELAY_MS,
}: UseAttachmentPreviewInput): UseAttachmentPreviewReturn {
  const client = useAttachments();
  const [state, setState] = useState<UseAttachmentPreviewReturn>({
    url: undefined,
    header: undefined,
    loading: false,
    error: undefined,
  });

  useEffect(() => {
    if (!client || !ref) {
      setState({
        url: undefined,
        header: undefined,
        loading: false,
        error: undefined,
      });
      return;
    }
    let cancelled = false;
    let revoke: (() => void) | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;
    setState({
      url: undefined,
      header: undefined,
      loading: true,
      error: undefined,
    });
    const load = () => {
      client
        .downloadObjectUrl({ documentId, ref })
        .then((result) => {
          if (cancelled) {
            result.revoke();
            return;
          }
          revoke = result.revoke;
          setState({
            url: result.url,
            header: result.header,
            loading: false,
            error: undefined,
          });
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          if (attempt < retries) {
            attempt += 1;
            timer = setTimeout(load, retryDelayMs);
            return; // stay in loading state while the index catches up
          }
          setState({
            url: undefined,
            header: undefined,
            loading: false,
            error: err instanceof Error ? err : new Error(String(err)),
          });
        });
    };
    load();
    return () => {
      cancelled = true;
      if (timer !== undefined) clearTimeout(timer);
      revoke?.();
    };
  }, [client, documentId, ref, retries, retryDelayMs]);

  return state;
}

/** Upload lifecycle status. progress is coarse (0 before/during, 1 on Done) because RemoteAttachmentUpload buffers the full body before issuing a single PUT. */
export enum UploadStatus {
  None = "None",
  Hashing = "Hashing",
  Uploading = "Uploading",
  Done = "Done",
  Error = "Error",
}

export type UseAttachmentUploadReturn = {
  preprocess: (file: Blob) => Promise<PreprocessResult>;
  upload: (results: PreprocessResult) => Promise<void>;
  status: UploadStatus;
  progress: number;
  error: Error | undefined;
};

/** Hook for managing the full attachment preprocess + upload lifecycle. preprocess and upload callbacks are stable (useCallback) and depend only on the current IAttachmentClient reference. */
export function useAttachmentUpload(): UseAttachmentUploadReturn {
  const [status, setStatus] = useState<UploadStatus>(UploadStatus.None);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<Error | undefined>(undefined);
  const client = useAttachments();

  const preprocess = useCallback(
    async (file: Blob): Promise<PreprocessResult> => {
      if (!client) throw new Error("AttachmentClient not available");
      setError(undefined);
      setStatus(UploadStatus.Hashing);
      try {
        return await client.preprocess(file);
      } catch (err) {
        setError(err instanceof Error ? err : new Error(String(err)));
        setStatus(UploadStatus.Error);
        throw err;
      }
    },
    [client],
  );

  const upload = useCallback(
    async (results: PreprocessResult): Promise<void> => {
      if (!client) throw new Error("AttachmentClient not available");
      setError(undefined);
      setStatus(UploadStatus.Uploading);
      setProgress(0);
      try {
        await client.reserve(results.options, (handle) =>
          handle.send(results.stream()),
        );
      } catch (err) {
        setError(err instanceof Error ? err : new Error(String(err)));
        setStatus(UploadStatus.Error);
        throw err;
      }
      setProgress(1);
      setStatus(UploadStatus.Done);
    },
    [client],
  );

  return { preprocess, upload, status, progress, error };
}
