import {
  DEVTOOLS_TOKEN_HEADER,
  type DevtoolsApiError,
  type DevtoolsApiErrorCode,
  type DevStackInfo,
  type ProjectFileList,
  type ProjectDocumentModelDetail,
  type ProjectFileText,
  type ProjectSnapshot,
} from "./api.js";
import { readDevtoolsToken } from "./host.js";

/** Why a request got no answer: the API's own code, a page that came without
 * a token, or a server that could not be reached. */
export type DevtoolsApiFailureCode =
  | DevtoolsApiErrorCode
  | "no_token"
  | "unreachable";

type Failure = {
  ok: false;
  code: DevtoolsApiFailureCode;
  message: string;
};

export type DevtoolsApiResult<T> = { ok: true; data: T } | Failure;

/** The snapshot, or word that the revision the caller holds is still current. */
export type ProjectSnapshotAnswer =
  | { modified: true; snapshot: ProjectSnapshot }
  | { modified: false };

/** Above the 30 s the server allows itself to read the project. */
export const REQUEST_TIMEOUT_MS = 45_000;

const TIMED_OUT: Failure = {
  ok: false,
  code: "unreachable",
  message: `The DevTools API did not answer in ${REQUEST_TIMEOUT_MS / 1000} s.`,
};

async function read<T>(response: Response): Promise<DevtoolsApiResult<T>> {
  try {
    if (response.ok) return { ok: true, data: (await response.json()) as T };
    const { error } = (await response.json()) as DevtoolsApiError;
    return { ok: false, code: error.code, message: error.message };
  } catch {
    // Anything but the API answered: a proxy, or the app's own fallback page.
    return {
      ok: false,
      code: "unreachable",
      message: `The DevTools API answered HTTP ${response.status} without JSON.`,
    };
  }
}

/** Sends one request and gives its answer, or the failure. The request is
 * given up when `signal` aborts or after `REQUEST_TIMEOUT_MS`, body included. */
async function request<T>(
  apiBase: string,
  route: string,
  signal: AbortSignal | undefined,
  answer: (response: Response) => Promise<DevtoolsApiResult<T>> = read,
  headers?: Record<string, string>,
): Promise<DevtoolsApiResult<T>> {
  const token = readDevtoolsToken();
  if (!token) {
    return {
      ok: false,
      code: "no_token",
      message: "This page was not served by a ph dev server.",
    };
  }
  const controller = new AbortController();
  const abort = () => controller.abort();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    abort();
  }, REQUEST_TIMEOUT_MS);
  if (signal?.aborted) abort();
  signal?.addEventListener("abort", abort, { once: true });
  try {
    const response = await fetch(`${apiBase}/${route}`, {
      headers: { [DEVTOOLS_TOKEN_HEADER]: token, ...headers },
      signal: controller.signal,
    });
    const result = await answer(response);
    return timedOut && !result.ok ? TIMED_OUT : result;
  } catch (error) {
    if (timedOut) return TIMED_OUT;
    return {
      ok: false,
      code: "unreachable",
      message: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}

export function fetchDevtoolsInfo(
  apiBase: string,
  signal?: AbortSignal,
): Promise<DevtoolsApiResult<DevStackInfo>> {
  return request<DevStackInfo>(apiBase, "info", signal);
}

/** `revision` is the one the caller already holds, if any. */
export function fetchProjectSnapshot(
  apiBase: string,
  revision?: string,
  signal?: AbortSignal,
): Promise<DevtoolsApiResult<ProjectSnapshotAnswer>> {
  return request<ProjectSnapshotAnswer>(
    apiBase,
    "project",
    signal,
    async (response) => {
      if (response.status === 304) {
        return { ok: true, data: { modified: false } };
      }
      const result = await read<ProjectSnapshot>(response);
      return result.ok
        ? { ok: true, data: { modified: true, snapshot: result.data } }
        : result;
    },
    revision === undefined ? undefined : { "If-None-Match": `"${revision}"` },
  );
}

export function fetchProjectDocumentModel(
  apiBase: string,
  documentType: string,
  signal?: AbortSignal,
): Promise<DevtoolsApiResult<ProjectDocumentModelDetail>> {
  return request<ProjectDocumentModelDetail>(
    apiBase,
    `project/document-models/${encodeURIComponent(documentType)}`,
    signal,
  );
}

export function fetchProjectFileList(
  apiBase: string,
  signal?: AbortSignal,
): Promise<DevtoolsApiResult<ProjectFileList>> {
  return request<ProjectFileList>(apiBase, "project/files", signal);
}

/** `path` is relative to the project, as `project/files` lists it. */
export function fetchProjectFile(
  apiBase: string,
  path: string,
  signal?: AbortSignal,
): Promise<DevtoolsApiResult<ProjectFileText>> {
  return request<ProjectFileText>(
    apiBase,
    `project/files/${encodeURIComponent(path)}`,
    signal,
  );
}

/** The page's token cannot change while the page stays open, so a request
 * the server refused for it, or that had none to send, fails the same again. */
export const needsReload = (code: DevtoolsApiFailureCode) =>
  code === "bad_token" || code === "no_token";

/** A refusal that stays for as long as the page stays open: for its token,
 * or for the address the browser reached the server at, which the API
 * answers on loopback only. Asking again gets the same answer. */
export const refusedForThisPage = (code: DevtoolsApiFailureCode) =>
  needsReload(code) || code === "bad_host" || code === "bad_origin";
