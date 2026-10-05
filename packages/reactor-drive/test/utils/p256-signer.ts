import type { ISigner } from "@powerhousedao/shared/document-model";
import { signActionV2 } from "@powerhousedao/shared/document-model";

const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

/** An ISigner over a fresh P-256 key that emits v2 tuples. */
export async function createP256Signer(): Promise<ISigner> {
  const keyPair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  const raw = new Uint8Array(
    await crypto.subtle.exportKey("raw", keyPair.publicKey),
  );
  const compressed = new Uint8Array(35);
  compressed[0] = 0x80;
  compressed[1] = 0x24;
  compressed[2] = (raw[64] & 1) === 1 ? 0x03 : 0x02;
  compressed.set(raw.subarray(1, 33), 3);
  const did = `did:key:z${base58Encode(compressed)}`;

  const user = { address: "0xabc", networkId: "eip155", chainId: 1 };
  const app = { name: "test", key: did };
  const sign = async (data: Uint8Array) =>
    new Uint8Array(
      await crypto.subtle.sign(
        { name: "ECDSA", hash: "SHA-256" },
        keyPair.privateKey,
        data.buffer as ArrayBuffer,
      ),
    );

  return {
    user,
    app,
    publicKey: keyPair.publicKey,
    sign,
    verify: () => Promise.resolve(),
    signAction: (action, target) =>
      signActionV2({ action, target, signer: { user, app }, sign }),
  };
}

function base58Encode(bytes: Uint8Array): string {
  const digits: number[] = [0];
  for (const byte of bytes) {
    let carry = byte;
    for (let i = 0; i < digits.length; i++) {
      carry += digits[i] << 8;
      digits[i] = carry % 58;
      carry = Math.floor(carry / 58);
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = Math.floor(carry / 58);
    }
  }
  let out = "";
  for (let k = 0; k < bytes.length && bytes[k] === 0; k++) {
    out += "1";
  }
  for (let i = digits.length - 1; i >= 0; i--) {
    out += BASE58[digits[i]];
  }
  return out;
}
