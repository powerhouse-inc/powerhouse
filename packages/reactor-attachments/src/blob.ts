/** Tells a Blob from a stream by shape: `instanceof Blob` misses other realms and polyfills. */
export function isBlob(data: ReadableStream<Uint8Array> | Blob): data is Blob {
  return !("getReader" in data);
}
