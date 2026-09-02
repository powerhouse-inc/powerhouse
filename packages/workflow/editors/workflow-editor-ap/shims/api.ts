// Shim for @/lib/api: there is no AP REST server behind this editor.
class ApiShimError extends Error {
  constructor(path: string) {
    super(`AP server API is not available (${path})`);
  }
}

function reject<T>(path: string): Promise<T> {
  return Promise.reject(new ApiShimError(path));
}

export const api = {
  get: <T>(path: string, _params?: unknown): Promise<T> => reject<T>(path),
  post: <T>(
    path: string,
    _body?: unknown,
    _params?: unknown,
    _headers?: Record<string, string>,
  ): Promise<T> => reject<T>(path),
  put: <T>(path: string, _body?: unknown): Promise<T> => reject<T>(path),
  delete: <T>(path: string, _params?: unknown): Promise<T> => reject<T>(path),
  isError: (
    error: unknown,
  ): error is Error & { response?: { status?: number } } =>
    error instanceof Error,
};
