import {
  createAttachmentClient,
  type IAttachmentClient,
  type PreprocessResult,
} from "@powerhousedao/reactor-attachments/client";
import { useCallback, useMemo, useState } from "react";
import { useAttachmentService } from "./attachment-service.js";

/** Returns an IAttachmentClient wrapping the current IAttachmentService, or undefined if none is set. */
export function useAttachments(): IAttachmentClient | undefined {
  const service = useAttachmentService();
  return useMemo(
    () => (service ? createAttachmentClient(service) : undefined),
    [service],
  );
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
