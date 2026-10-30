/** Tells a Blob from a stream by shape: `instanceof Blob` misses other realms and polyfills. */
export function isBlob(data: ReadableStream<Uint8Array> | Blob): data is Blob {
  return !("getReader" in data);
}

const BLOB_SLICE_BYTES = 8 * 1024 * 1024;

/**
 * A Blob's bytes as a stream, read a slice at a time and only when asked.
 *
 * Not `blob.stream()`: under Node 24 that call keeps the async context it was
 * made in alive for good, read or not, and with it everything the context's
 * stores reach. A workflow run's context reaches the run's whole output.
 */
export function blobStream(
  blob: Blob,
  sliceBytes = BLOB_SLICE_BYTES,
): ReadableStream<Uint8Array> {
  let offset = 0;
  return new ReadableStream<Uint8Array>(
    {
      async pull(controller) {
        if (offset >= blob.size) {
          controller.close();
          return;
        }
        const slice = blob.slice(offset, offset + sliceBytes);
        offset += sliceBytes;
        controller.enqueue(new Uint8Array(await slice.arrayBuffer()));
      },
    },
    { highWaterMark: 0 },
  );
}
