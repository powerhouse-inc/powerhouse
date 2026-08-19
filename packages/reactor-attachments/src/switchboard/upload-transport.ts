/**
 * The seam every attachment upload PUT goes through.
 *
 * It exists because `fetch` cannot report upload-side progress: there is no
 * event between "request issued" and "response received". Naming the transport
 * lets an implementation that *can* count bytes (see
 * `createXhrUploadTransport`) be substituted without the upload code knowing
 * which one it holds — and it is also the right seam for a future multipart
 * upload, which needs one request per part.
 */

/**
 * Headers are forwarded VERBATIM. A presigned target's headers are part of a
 * signature: normalizing their casing, or adding so much as one header,
 * invalidates it.
 */
export type AttachmentUploadRequest = {
  url: string;
  method: "PUT";
  headers: Record<string, string>;
  body: Blob;
  /** Called with cumulative bytes handed to the socket, when observable. */
  onProgress?: (loaded: number, total: number) => void;
  signal?: AbortSignal;
};

/**
 * The only response surface the upload code reads. A real `Response`
 * satisfies this structurally, which is what lets the fetch transport be an
 * identity pass-through rather than an adapter.
 */
export type AttachmentUploadResponse = {
  readonly status: number;
  readonly statusText: string;
  readonly ok: boolean;
  json(): Promise<unknown>;
};

export type AttachmentUploadTransport = (
  request: AttachmentUploadRequest,
) => Promise<AttachmentUploadResponse>;

/**
 * The default transport. Ignores `onProgress` — fetch has no upload-side
 * progress event, and silence is how a transport reports that bytes are
 * unobservable.
 */
export function createFetchUploadTransport(
  fetchFn: typeof fetch,
): AttachmentUploadTransport {
  return (request) =>
    fetchFn(request.url, {
      method: request.method,
      headers: request.headers,
      body: request.body,
      ...(request.signal ? { signal: request.signal } : {}),
    });
}
