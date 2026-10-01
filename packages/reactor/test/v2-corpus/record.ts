import { writeFileSync } from "node:fs";
import { it } from "vitest";
import { CORPUS_PATH, recordCorpus } from "./scenarios.js";

// pnpm vitest run --config test/v2-corpus/vitest.record.config.ts

it("records the v2 corpus", async () => {
  const corpus = await recordCorpus();
  const out = process.env.V2_CORPUS_OUT ?? CORPUS_PATH;
  writeFileSync(out, `${JSON.stringify(corpus, null, 2)}\n`);
}, 300_000);
