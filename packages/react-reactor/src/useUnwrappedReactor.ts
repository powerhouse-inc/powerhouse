import { type IDocumentDriveServer } from "document-drive";
import { atom, useAtomValue } from "jotai";
import { unwrap } from "jotai/utils";

import { createBrowserDocumentDriveServer } from "./reactor";
import { baseDocumentModels } from "./document-model";

const ROUTER_BASENAME = "/";

async function initReactor(reactor: IDocumentDriveServer) {
  const errors = await reactor.initialize();
  const error = errors?.at(0);
  if (error) {
    throw error;
  }
}

const reactor = (async () => {
  const server = createBrowserDocumentDriveServer(
    baseDocumentModels,
    ROUTER_BASENAME,
  );
  await initReactor(server);
  return server;
})();

const reactorAtom = atom<Promise<IDocumentDriveServer>>(reactor);
const unwrappedReactor = unwrap(reactorAtom);

export const useUnwrappedReactor = () =>
  useAtomValue<IDocumentDriveServer | undefined>(unwrappedReactor);

export const useReactorAsync = () => {
  return reactor;
};
