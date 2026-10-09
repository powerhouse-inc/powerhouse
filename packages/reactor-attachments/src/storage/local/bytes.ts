/**
 * Drains `stream` into one `Uint8Array`.
 *
 * The local stores hold whole blobs (see {@link ILocalAttachmentBackend}), so
 * the stream an `IAttachmentStore.put` is handed has to be collected before it
 * can be written. Realm-neutral: no `node:buffer`, no `Blob`.
 */
export async function collectStream(
  stream: ReadableStream<Uint8Array>,
): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.byteLength;
  }

  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

/** A one-chunk `ReadableStream` over `bytes`. */
export function streamFromBytes(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}
