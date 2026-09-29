import type {
  ActionSigner,
  ISigner,
} from "@powerhousedao/shared/document-model";
import { signActionV2 } from "@powerhousedao/shared/document-model";

const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

export type WorkerSignerArgs = {
  privateJwk: JsonWebKey;
  publicJwk: JsonWebKey;
  user: ActionSigner["user"];
};

/** One P-256 key the host and every pooled worker sign with. */
export async function generateWorkerSignerArgs(
  user: ActionSigner["user"],
): Promise<WorkerSignerArgs> {
  const pair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  return {
    privateJwk: await crypto.subtle.exportKey("jwk", pair.privateKey),
    publicJwk: await crypto.subtle.exportKey("jwk", pair.publicKey),
    user,
  };
}

/** The worker factory: `initArgs` is a {@link WorkerSignerArgs}. */
export async function createWorkerSigner(
  args: WorkerSignerArgs,
): Promise<ISigner> {
  const algorithm = { name: "ECDSA", namedCurve: "P-256" };
  const privateKey = await crypto.subtle.importKey(
    "jwk",
    args.privateJwk,
    algorithm,
    false,
    ["sign"],
  );
  const publicKey = await crypto.subtle.importKey(
    "jwk",
    args.publicJwk,
    algorithm,
    true,
    ["verify"],
  );
  const did = await didKey(publicKey);
  const sign = async (data: Uint8Array): Promise<Uint8Array> =>
    new Uint8Array(
      await crypto.subtle.sign(
        { name: "ECDSA", hash: "SHA-256" },
        privateKey,
        data.buffer as ArrayBuffer,
      ),
    );
  const app = { name: "test", key: did };
  return {
    user: args.user,
    app,
    publicKey,
    sign,
    verify: () => Promise.resolve(),
    signAction: (action, target) =>
      signActionV2({
        action,
        target,
        signer: { user: args.user, app },
        sign,
        previousStateHash: "",
      }),
  };
}

async function didKey(publicKey: CryptoKey): Promise<string> {
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", publicKey));
  const compressed = new Uint8Array(35);
  compressed[0] = 0x80;
  compressed[1] = 0x24;
  compressed[2] = (raw[64] & 1) === 1 ? 0x03 : 0x02;
  compressed.set(raw.subarray(1, 33), 3);
  return `did:key:z${base58(compressed)}`;
}

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
  for (let k = 0; k < bytes.length && bytes[k] === 0; k++) {
    out += "1";
  }
  for (let i = digits.length - 1; i >= 0; i--) {
    out += BASE58[digits[i]];
  }
  return out;
}
