import { canonicalJson } from "../../src/definition/kernel/primitives.js";
import { PARITY_PAIRS, type ParityPair, type ParityVersion } from "./corpus.js";

export type Golden = { readonly file: string; readonly content: string };

function golden(pair: ParityPair, { version, twin }: ParityVersion): Golden {
  const file =
    pair.versions.length === 1
      ? `${pair.name}.json`
      : `${pair.name}.v${version}.json`;
  const content = canonicalJson({
    original: pair.original,
    version,
    documentModel: twin.documentModel,
    definition: twin.definition,
  });
  return { file, content: `${content}\n` };
}

export const GOLDENS_DIRECTORY = new URL("./goldens/", import.meta.url);

export const GOLDENS: readonly Golden[] = PARITY_PAIRS.flatMap((pair) =>
  pair.versions.map((entry) => golden(pair, entry)),
);
