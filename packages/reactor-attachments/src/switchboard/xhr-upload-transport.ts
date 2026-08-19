import {
  createFetchUploadTransport,
  type AttachmentUploadRequest,
  type AttachmentUploadResponse,
  type AttachmentUploadTransport,
} from "./upload-transport.js";

export type XhrUploadTransportOptions = {
  /**
   * Used where `XMLHttpRequest` does not exist (Node). Defaults to the global
   * fetch, resolved at call time.
   */
  fetchFn?: typeof fetch;
};

/**
 * Upload transport backed by `XMLHttpRequest`, the only browser API that
 * reports upload-side byte progress (`xhr.upload.onprogress`). Everything else
 * about the request is identical to the fetch path.
 *
 * Capability detection happens **inside** the returned function, never at
 * module load: this module is reachable from the client entry, which is
 * executed in Node by the entrypoint tests, and Node has no
 * `XMLHttpRequest`. Detecting per call also means a test can install a fake on
 * `globalThis` without any module-registry reset.
 */
export function createXhrUploadTransport(
  options?: XhrUploadTransportOptions,
): AttachmentUploadTransport {
  return (request) => {
    const XhrCtor = globalThis.XMLHttpRequest;
    if (typeof XhrCtor !== "function") {
      const fetchFn = options?.fetchFn ?? globalThis.fetch;
      return createFetchUploadTransport(fetchFn.bind(globalThis))(request);
    }
    return sendWithXhr(new XhrCtor(), request);
  };
}

/**
 * Mirrors fetch's observable behavior closely enough that
 * `RemoteAttachmentUpload` cannot tell the two apart:
 *
 * - `responseType` is left at `""`, so a non-JSON 422 body still reaches the
 *   caller's `json()` and fails there rather than being swallowed.
 * - status 0 never resolves. XHR reports 0 for network failure, CORS refusal
 *   and abort alike; resolving it would fabricate a transfer error claiming
 *   the provider answered 0.
 * - failures reject with fetch's error shapes: `TypeError` for network,
 *   `AbortError` for abort.
 */
function sendWithXhr(
  xhr: XMLHttpRequest,
  request: AttachmentUploadRequest,
): Promise<AttachmentUploadResponse> {
  return new Promise<AttachmentUploadResponse>((resolve, reject) => {
    const signal = request.signal;
    let settled = false;

    const abortListener = () => xhr.abort();
    const detach = () => signal?.removeEventListener("abort", abortListener);
    const succeed = (response: AttachmentUploadResponse) => {
      if (settled) return;
      settled = true;
      detach();
      resolve(response);
    };
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      detach();
      reject(error);
    };

    if (signal?.aborted) {
      fail(abortError());
      return;
    }

    xhr.open(request.method, request.url, true);
    // Verbatim: a presigned target's headers are part of its signature.
    for (const [name, value] of Object.entries(request.headers)) {
      xhr.setRequestHeader(name, value);
    }

    // Attached before send(), and only when a caller is listening — merely
    // registering an upload listener forces a CORS preflight.
    if (request.onProgress) {
      xhr.upload.addEventListener("progress", (event: ProgressEvent) => {
        if (!event.lengthComputable) return;
        request.onProgress?.(event.loaded, event.total);
      });
    }

    xhr.addEventListener("load", () => {
      if (xhr.status === 0) {
        fail(networkError());
        return;
      }
      succeed(toResponse(xhr));
    });
    xhr.addEventListener("error", () => fail(networkError()));
    xhr.addEventListener("timeout", () => fail(networkError()));
    xhr.addEventListener("abort", () => fail(abortError()));

    signal?.addEventListener("abort", abortListener);
    xhr.send(request.body);
  });
}

function toResponse(xhr: XMLHttpRequest): AttachmentUploadResponse {
  return {
    status: xhr.status,
    statusText: xhr.statusText,
    ok: xhr.status >= 200 && xhr.status < 300,
    json: () => {
      try {
        return Promise.resolve(JSON.parse(xhr.responseText));
      } catch (err) {
        return Promise.reject(
          err instanceof Error ? err : new Error(String(err)),
        );
      }
    },
  };
}

function networkError(): TypeError {
  return new TypeError("Failed to fetch");
}

function abortError(): DOMException {
  return new DOMException("The operation was aborted", "AbortError");
}
