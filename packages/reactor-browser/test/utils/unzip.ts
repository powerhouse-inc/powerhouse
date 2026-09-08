import { unzip } from "fflate";

/**
 * Unzips an archive into a map of entry path to bytes. Directory entries
 * (trailing slash) are included, matching how the archives under test are
 * assembled.
 */
export async function unzipAsync(
  data: Uint8Array,
): Promise<Record<string, Uint8Array>> {
  const { promise, resolve, reject } =
    Promise.withResolvers<Record<string, Uint8Array>>();
  unzip(new Uint8Array(data), (error, files) => {
    if (error) {
      reject(error);
      return;
    }
    resolve(files as Record<string, Uint8Array>);
  });
  return await promise;
}
