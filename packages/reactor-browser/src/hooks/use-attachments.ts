import {
  createAttachmentClient,
  type AttachmentDownloadInput,
  type AttachmentHeader,
  type AttachmentProgress,
  type AttachmentStage,
  type AttachmentUploadResult,
  type IAttachmentClient,
  type IAttachmentService,
  type PreprocessResult,
} from "@powerhousedao/reactor-attachments/client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAttachmentService } from "./attachment-service.js";
import {
  createProgressGate,
  doneProgress,
  IDLE_PROGRESS,
  toProgressState,
  type AttachmentProgressState,
} from "./attachment-progress.js";

/**
 * One client per service, shared across every component.
 *
 * A per-component `useMemo` handed each caller its own wrapper, so nothing
 * client-scoped could ever be shared or cached. Keyed weakly so a replaced
 * service is collectable.
 */
const clientsByService = new WeakMap<IAttachmentService, IAttachmentClient>();

function clientFor(service: IAttachmentService): IAttachmentClient {
  const existing = clientsByService.get(service);
  if (existing) return existing;
  const created = createAttachmentClient(service);
  clientsByService.set(service, created);
  return created;
}

/** Returns an IAttachmentClient wrapping the current IAttachmentService, or undefined if none is set. */
export function useAttachments(): IAttachmentClient | undefined {
  const service = useAttachmentService();
  return service ? clientFor(service) : undefined;
}

/**
 * Upload lifecycle stage, derived from the client's own `AttachmentStage` plus
 * an `idle` state the client has no reason to model.
 *
 * The compile-time guard below is the point: a stage added upstream becomes a
 * type error here rather than a string that silently never matches. The old
 * `UploadStatus` enum was a parallel vocabulary that had already drifted (it
 * never gained `Reserving`).
 */
export type AttachmentUploadStage =
  | "idle"
  | "hashing"
  | "reserving"
  | "uploading"
  | "done"
  | "error";

export type AttachmentDownloadStage =
  | "idle"
  | "requesting-download-target"
  | "downloading"
  | "done"
  | "error";

type UploadStages = Extract<
  AttachmentStage,
  "hashing" | "reserving" | "uploading" | "done" | "error"
>;
type DownloadStages = Extract<
  AttachmentStage,
  "requesting-download-target" | "downloading" | "done" | "error"
>;

type Covers<Wider, Narrower> =
  Exclude<Wider, Narrower> extends never ? true : never;

// Each of these fails to compile if a stage is added upstream without being
// mapped here, or mapped without being exposed.
type UploadUnionCoversClient = Covers<UploadStages, AttachmentUploadStage>;
type DownloadUnionCoversClient = Covers<
  DownloadStages,
  AttachmentDownloadStage
>;
type EveryClientStageIsMapped = Covers<
  AttachmentStage,
  UploadStages | DownloadStages
>;
const stageDriftGuards: [
  UploadUnionCoversClient,
  DownloadUnionCoversClient,
  EveryClientStageIsMapped,
] = [true, true, true];
void stageDriftGuards;

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

export type UseAttachmentUploadReturn = {
  preprocess: (file: Blob) => Promise<PreprocessResult>;
  upload: (results: PreprocessResult) => Promise<void>;
  /** Aborts the transfer in flight; the upload promise rejects. */
  cancel: () => void;
  /** Returns to idle, discarding the previous result and error. */
  reset: () => void;
  stage: AttachmentUploadStage;
  progress: AttachmentProgressState;
  result: AttachmentUploadResult | undefined;
  error: Error | undefined;
};

const IDLE_UPLOAD = {
  stage: "idle" as AttachmentUploadStage,
  progress: IDLE_PROGRESS,
  result: undefined as AttachmentUploadResult | undefined,
  error: undefined as Error | undefined,
};

/**
 * Full attachment preprocess + upload lifecycle with byte-level progress.
 *
 * The two-call split is kept on purpose: the ref must reach the document
 * before the bytes are committed, so callers preprocess, dispatch the
 * operation, then upload. The second call routes through `client.upload`
 * rather than reimplementing the flow, which is what makes progress, dedup
 * reporting and cancellation identical to the non-React path.
 */
export function useAttachmentUpload(): UseAttachmentUploadReturn {
  const [state, setState] = useState(IDLE_UPLOAD);
  const client = useAttachments();
  const abortRef = useRef<AbortController | undefined>(undefined);
  const mountedRef = useRef(true);
  // Generation counter: a slow first upload's late 40% tick must not land on
  // top of a fast second upload's 90%.
  const runIdRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const preprocess = useCallback(
    async (file: Blob): Promise<PreprocessResult> => {
      if (!client) throw new Error("AttachmentClient not available");
      const runId = ++runIdRef.current;
      setState({ ...IDLE_UPLOAD, stage: "hashing" });
      try {
        return await client.preprocess(file);
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        if (mountedRef.current && runId === runIdRef.current) {
          setState((prev) => ({ ...prev, stage: "error", error }));
        }
        throw err;
      }
    },
    [client],
  );

  const upload = useCallback(
    async (results: PreprocessResult): Promise<void> => {
      if (!client) throw new Error("AttachmentClient not available");
      const runId = ++runIdRef.current;
      const controller = new AbortController();
      abortRef.current = controller;
      const gate = createProgressGate();
      const isCurrent = () => mountedRef.current && runId === runIdRef.current;

      setState({ ...IDLE_UPLOAD, stage: "reserving" });
      let uploadResult: AttachmentUploadResult;
      try {
        uploadResult = await client.upload(
          { preprocessed: results, signal: controller.signal },
          {
            onProgress: (progress: AttachmentProgress) => {
              if (!isCurrent()) return;
              // The terminal frame is written after the await instead: XHR does
              // not guarantee a final loaded === total, and a dedup emits no
              // byte events at all.
              if (progress.stage === "done" || progress.stage === "error") {
                return;
              }
              if (!gate(progress)) return;
              setState((prev) => ({
                ...prev,
                stage: progress.stage as AttachmentUploadStage,
                progress: toProgressState(progress),
              }));
            },
          },
        );
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        // Progress is left where it stopped: a bar snapping to zero hides how
        // far the transfer actually got.
        if (isCurrent()) {
          setState((prev) => ({ ...prev, stage: "error", error }));
        }
        throw err;
      }

      if (isCurrent()) {
        setState((prev) => ({
          ...prev,
          stage: "done",
          progress: doneProgress(results.sizeBytes),
          result: uploadResult,
          error: undefined,
        }));
      }
    },
    [client],
  );

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const reset = useCallback(() => {
    runIdRef.current += 1;
    abortRef.current = undefined;
    setState(IDLE_UPLOAD);
  }, []);

  return {
    preprocess,
    upload,
    cancel,
    reset,
    stage: state.stage,
    progress: state.progress,
    result: state.result,
    error: state.error,
  };
}
