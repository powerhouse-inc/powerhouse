/* eslint-disable @typescript-eslint/no-floating-promises */
import { atom, useAtom } from "jotai";
import { useEffect, useMemo } from "react";

import {
  type DID,
  type IConnectCrypto,
  ConnectCrypto,
} from "../crypto/index.js";
import { BrowserKeyStorage } from "../crypto/browser.js";

const connectCrypto = (async () => {
  const connectCrypto = new ConnectCrypto(new BrowserKeyStorage());
  await connectCrypto.did();
  return connectCrypto;
})();

export function useConnectCrypto(): IConnectCrypto {
  return useMemo(
    () => ({
      async regenerateDid() {
        const crypto = await connectCrypto;
        return crypto.regenerateDid();
      },
      async did() {
        const crypto = await connectCrypto;
        return crypto.did();
      },
      sign: async (data: Uint8Array) => {
        const crypto = await connectCrypto;
        return await crypto.sign(data);
      },
    }),
    [],
  );
}

const didAtom = atom<DID | undefined>(undefined);

export function useConnectDid(): DID | undefined {
  const [did, setDid] = useAtom(didAtom);

  useEffect(() => {
    if (did) {
      return;
    }
    connectCrypto
      .then((c) => c.did())
      .then((did) => setDid(did))
      .catch(console.error);
  });

  return did;
}
