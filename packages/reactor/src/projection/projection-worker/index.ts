function resolveProjectionWorkerEntryPath(): string {
  const url = new URL("./projection-entry.js", import.meta.url);
  if (url.protocol !== "file:") {
    return url.href;
  }
  let pathname = decodeURIComponent(url.pathname);
  if (/^\/[A-Za-z]:[/\\]/.test(pathname)) {
    pathname = pathname.slice(1);
  }
  return pathname;
}

export const projectionWorkerEntryPath = resolveProjectionWorkerEntryPath();
