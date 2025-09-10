import type { ReplayDocumentOptions } from "document-model";
import {
  createZip,
  garbageCollectDocumentOperations,
  replayDocument,
  validateOperations,
  type BaseStateFromDocument,
  type DocumentOperations,
  type FileInput,
  type PHDocument,
  type PHDocumentHeader,
  type Reducer,
} from "document-model";
import JSZip from "jszip";

export async function baseSaveToFileHandle(
  document: PHDocument,
  input: FileSystemFileHandle,
) {
  const zip = createZip(document);
  const blob = await zip.generateAsync({ type: "blob" });
  const writable = await input.createWritable();
  await writable.write(blob);
  await writable.close();
}

export async function baseLoadFromInput<TDocument extends PHDocument>(
  input: FileInput,
  reducer: Reducer<TState>,
  options?: ReplayDocumentOptions,
): Promise<PHDocument<TState>> {
  const zip = new JSZip();
  await zip.loadAsync(input);
  return loadFromZip(zip, reducer, options);
}

async function loadFromZip<TState extends PHBaseState>(
  zip: JSZip,
  reducer: Reducer<TState>,
  options?: ReplayDocumentOptions,
): Promise<PHDocument<TState>> {
  const initialStateZip = zip.file("state.json");
  if (!initialStateZip) {
    throw new Error("Initial state not found");
  }
  const initialStateStr = await initialStateZip.async("string");
  const initialState = JSON.parse(initialStateStr) as TState;

  const headerZip = zip.file("header.json");
  let header: PHDocumentHeader | undefined = undefined;
  if (headerZip) {
    header = JSON.parse(await headerZip.async("string")) as PHDocumentHeader;
  }

  const operationsZip = zip.file("operations.json");
  if (!operationsZip) {
    throw new Error("Operations history not found");
  }
  const operations = JSON.parse(
    await operationsZip.async("string"),
  ) as DocumentOperations;

  const clearedOperations = garbageCollectDocumentOperations(operations);

  const operationsError = validateOperations(clearedOperations);
  if (operationsError.length) {
    const errorMessages = operationsError.map((err) => err.message);
    throw new Error(errorMessages.join("\n"));
  }

  // TODO: There is a race condition here where operations are replayed and do not necessary
  // result in the same lastModified value. This will be fixed once the header replaces this
  // information as it is explicitly set below to the saved time.
  let result = replayDocument(
    initialState,
    clearedOperations,
    reducer,
    undefined,
    header,
    {},
    options,
  );

  if (header) {
    result = {
      ...result,
      header,
    };
  }
  return result;
}
