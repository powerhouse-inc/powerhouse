import { useEffect, useMemo, useState } from "react";
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
      verify: async (data: Uint8Array, signature: Uint8Array) => {
        const crypto = await getConnectCrypto();
        return await crypto.verify(data, signature);
      },
      publicKey: async () => {
        const crypto = await getConnectCrypto();
        return await crypto.publicKey();
      },
    }),
    [],
  );
}
export function useConnectDid(): DID | undefined {
  const [did, setDid] = useState<DID | undefined>(undefined);

  useEffect(() => {
    if (did !== undefined) {
      return;
    }
    getConnectCrypto()
      .then((c) => c.did())
      .then((did) => setDid(did))
      .catch(console.error);
  });

  return did;
}
