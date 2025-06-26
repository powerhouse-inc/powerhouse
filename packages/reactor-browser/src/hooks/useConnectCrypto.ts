import { atom, useAtom } from "jotai";
import { useEffect, useMemo } from "react";
import type { DID, IConnectCrypto } from "../crypto/index.js";

let _connectCrypto: Promise<IConnectCrypto> | undefined;

async function initConnectCrypto() {
  const { ConnectCrypto } = await import("../crypto/index.js");
  const { BrowserKeyStorage } = await import("../crypto/browser.js");
  const connectCrypto = new ConnectCrypto(new BrowserKeyStorage());
  await connectCrypto.did();
  return connectCrypto;
}

function getConnectCrypto(): Promise<IConnectCrypto> {
  if (_connectCrypto) {
    return _connectCrypto;
  }

  _connectCrypto = initConnectCrypto();
  return _connectCrypto;
}

export function useConnectCrypto(): IConnectCrypto {
  return useMemo(
    () => ({
      async regenerateDid() {
        const crypto = await getConnectCrypto();
        return crypto.regenerateDid();
      },
      async did() {
        const crypto = await getConnectCrypto();
        return crypto.did();
      },
      sign: async (data: Uint8Array) => {
        const crypto = await getConnectCrypto();
        return await crypto.sign(data);
      },
    }),
    [],
  );
}

const didAtom = atom<DID | undefined>(undefined);
didAtom.debugLabel = "didAtomFromReactorBrowser";

export function useConnectDid(): DID | undefined {
  const [did, setDid] = useAtom(didAtom);

  useEffect(() => {
    if (did) {
      return;
    }
    getConnectCrypto()
      .then((c) => c.did())
      .then((did) => setDid(did))
      .catch(console.error);
  }, [did]);

  return did;
}
