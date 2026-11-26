import {
  actionSignerIdentity,
  signActionV2,
  type Action,
  type ISigner,
} from "@powerhousedao/shared/document-model";

/**
 * Test helpers for code that signs actions. A test signer is a P-256 key made
 * with WebCrypto for a test user and signs v2 tuples, as a caller's session
 * does. No Renown is involved, so it runs in node and in a browser.
 */

/** The address a {@link testSigner} signs for when none is given. */
export const TEST_SIGNER_ADDRESS = "0xabc";

const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function base58(bytes: Uint8Array): string {
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
  for (let k = 0; k < bytes.length && bytes[k] === 0; k++) out += "1";
  for (let i = digits.length - 1; i >= 0; i--) out += BASE58[digits[i]];
  return out;
}

/** The did:key of a raw (uncompressed) P-256 public key. */
function didOfRawP256(raw: Uint8Array): string {
  // Multicodec 0x1200 (p256-pub), then the compressed point.
  const compressed = new Uint8Array(35);
  compressed[0] = 0x80;
  compressed[1] = 0x24;
  compressed[2] = (raw[64] & 1) === 1 ? 0x03 : 0x02;
  compressed.set(raw.subarray(1, 33), 3);
  return `did:key:z${base58(compressed)}`;
}

/**
 * A signer over a fresh P-256 key for the test user `address` (chain 1,
 * `eip155`), signing v2 tuples with the action's `prevOpHash` as its
 * previous state, as Renown's signer does. `app` names the session.
 */
export async function testSigner(
  address: string = TEST_SIGNER_ADDRESS,
  options: { app?: string } = {},
): Promise<ISigner> {
  const keyPair = await globalThis.crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  const raw = new Uint8Array(
    await globalThis.crypto.subtle.exportKey("raw", keyPair.publicKey),
  );
  const user = { address, networkId: "eip155", chainId: 1 };
  const app = { name: options.app ?? "test", key: didOfRawP256(raw) };
  const sign = async (data: Uint8Array) =>
    new Uint8Array(
      await globalThis.crypto.subtle.sign(
        { name: "ECDSA", hash: "SHA-256" },
        keyPair.privateKey,
        data as Uint8Array<ArrayBuffer>,
      ),
    );
  return {
    user,
    app,
    publicKey: keyPair.publicKey,
    sign,
    async verify(data, signature) {
      const valid = await globalThis.crypto.subtle.verify(
        { name: "ECDSA", hash: "SHA-256" },
        keyPair.publicKey,
        signature as Uint8Array<ArrayBuffer>,
        data as Uint8Array<ArrayBuffer>,
      );
      if (!valid) throw new Error("The signature does not verify.");
    },
    signAction: (action, target) =>
      signActionV2({
        action,
        target,
        signer: { user, app },
        sign,
        previousStateHash: action.context?.prevOpHash ?? "",
      }),
  };
}

/** `action` signed by `signer` for the log it is written to. */
export async function signFor(
  signer: ISigner,
  action: Action,
  documentId: string,
  branch = "main",
): Promise<Action> {
  const signature = await signer.signAction(action, { documentId, branch });
  return {
    ...action,
    context: {
      ...action.context,
      signer: { ...actionSignerIdentity(signer), signatures: [signature] },
    },
  };
}
