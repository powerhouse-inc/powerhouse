import {
  GetDocumentOptions,
  IDocumentDriveServer,
  StrandUpdate,
} from "document-drive";
import { PHDocument } from "document-model";
import { useSyncExternalStore } from "react";

type Args = {
  reactor: IDocumentDriveServer | undefined;
  driveId: string;
  documentId: string;
  options?: GetDocumentOptions;
};

async function getSnapshot<TDocument extends PHDocument>(
  args: Args,
): Promise<TDocument["state"] | undefined> {
  const { reactor, driveId, documentId, options } = args;
  const document = await reactor?.getDocument<TDocument>(
    driveId,
    documentId,
    options,
  );
  const state = document?.state;
  return state;
}

export function useDocumentState<TDocument extends PHDocument>(
  args: Args,
): Promise<TDocument["state"] | undefined> {
  const { reactor } = args;
  const state = useSyncExternalStore(
    (cb: (update: StrandUpdate) => void) => {
      if (!reactor) {
        throw new Error("Reactor is not loaded");
      }
      return reactor.on("strandUpdate", cb);
    },
    () => {
      return getSnapshot(args);
    },
  );
  return state;
}
