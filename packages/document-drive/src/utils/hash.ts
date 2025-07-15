export type HashAlgorithms = "MurmurHash";

export function hash(
  str: string,
  length = 12,
  algorithm: HashAlgorithms = "MurmurHash",
) {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (algorithm === "MurmurHash") {
    const hash = murmurHash64(str);
    return toBase62(hash, length);
  } else {
    // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
    throw new Error(`Unsupported hashing algorithm: ${algorithm}`);
  }
}

// MurmurHash64 implementation
function murmurHash64(input: string): bigint {
  let h = 0xcbf29ce484222325n; // FNV-1a 64-bit offset basis
  const prime = 0x100000001b3n;
  for (let i = 0; i < input.length; i++) {
    h ^= BigInt(input.charCodeAt(i));
    h *= prime;
  }
  return h & 0xffffffffffffffffn; // 64-bit mask
}

function toBase62(num: bigint, length = 12): string {
  const chars =
    "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let out = "";
  while (num > 0n && out.length < length) {
    out = chars[Number(num % 62n)] + out;
    num /= 62n;
  }
  return out.padStart(length, "0");
}
