# Usage

```tsx
// Upload
const { id, sink } = store.create({
  mimeType: "image/png",
  extension: "png",
});

console.log("Uploading attachment with ID:", id);

// Pipe a browser/File stream (or Node readable) into the sink
fileStream.pipeTo(sink).catch(() => abort("pipe failed"));

const { header, ref } = await sink.done();

console.log("Upload complete, with hash:", header.hash);

// Download
const response = await store.get(ref, {}, abortController.signal);
console.log(response.header.mimeType);

await response.body.pipeTo(destWritable);

```