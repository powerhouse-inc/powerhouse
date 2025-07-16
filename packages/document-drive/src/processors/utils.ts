import type { Options } from "@sindresorhus/fnv1a";
import fnv1a from "@sindresorhus/fnv1a";

const SUPPORTED_SIZES: Options["size"][] = [32, 64, 128, 256, 512, 1024];
const LOG2_26 = Math.log2(26); //
export type HashAlgorithms = "fnv1a";

/**
 * Hashes a string to a lowercase base-26 string.
 * @param str The string to hash.
 * @param length The length of the hash. Defaults to 10.
 * @param algorithm The hashing algorithm to use. Defaults to "fnv1a".
 * @returns The hashed string.
 */
export function hashNamespace(
  str: string,
  length = 10,
  algorithm: HashAlgorithms = "fnv1a",
) {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (algorithm === "fnv1a") {
    const requiredBits = Math.ceil(length * LOG2_26);
    const bitSize =
      SUPPORTED_SIZES.find((size) => size && size >= requiredBits) ?? 1024;
    const hash = fnv1a(str, { size: bitSize });
    return toBase26(hash, length);
  } else {
    // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
    throw new Error(`Unsupported hashing algorithm: ${algorithm}`);
  }
}

// converts hash to lowercase letters
function toBase26(num: bigint, length = 10): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz";
  let out = "";
  while (num > 0n && out.length < length) {
    out = alphabet[Number(num % 26n)] + out;
    num /= 26n;
  }
  return out.padStart(length, "a"); // optional padding
}
