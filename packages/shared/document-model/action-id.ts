export type ActionIdGeneratorOptions = {
  now?: () => number;
  random?: (bytes: Uint8Array<ArrayBuffer>) => void;
};

const COUNTER_MAX = 0xfff;
const HEX = Array.from({ length: 256 }, (_, i) =>
  i.toString(16).padStart(2, "0"),
);

/** UUIDv7 (RFC 9562 §6.2 method 1), strictly increasing per generator. */
export function createActionIdGenerator(
  options: ActionIdGeneratorOptions = {},
): () => string {
  const now = options.now ?? (() => Date.now());
  const random =
    options.random ??
    ((bytes: Uint8Array<ArrayBuffer>) => {
      globalThis.crypto.getRandomValues(bytes);
    });
  const bytes = new Uint8Array(16);
  let lastMs = -1;
  let counter = 0;

  return () => {
    const ms = now();
    random(bytes);
    // 11 random bits leave at least 2048 increments before an overflow.
    const seed = ((bytes[6] & 0x07) << 8) | bytes[7];
    if (ms > lastMs) {
      lastMs = ms;
      counter = seed;
    } else if (counter < COUNTER_MAX) {
      counter++;
    } else {
      lastMs++;
      counter = seed;
    }

    let rest = lastMs;
    for (let i = 5; i >= 0; i--) {
      bytes[i] = rest % 256;
      rest = Math.floor(rest / 256);
    }
    bytes[6] = 0x70 | (counter >> 8);
    bytes[7] = counter & 0xff;
    bytes[8] = 0x80 | (bytes[8] & 0x3f);

    let id = "";
    for (let i = 0; i < 16; i++) {
      if (i === 4 || i === 6 || i === 8 || i === 10) id += "-";
      id += HEX[bytes[i]];
    }
    return id;
  };
}

/** Ids from one process sort in creation order, so same-ms actions keep it. */
export const generateActionId: () => string = createActionIdGenerator();
