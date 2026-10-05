import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { promoteCandidate } from "../../src/services/definitions/build-steps.js";
import type { GenerationSteps } from "../../src/services/definitions/generation.js";
import { emitFixture } from "./emit-fixture.js";

export type Recorder = {
  readonly steps: GenerationSteps;
  readonly calls: string[];
  readonly candidateWrites: number;
  readonly promotions: number;
};

export function recorder(
  options: {
    readonly typecheckOk?: boolean;
    readonly candidateOk?: boolean;
    readonly packedOk?: boolean;
    readonly consumers?: readonly string[];
  } = {},
): Recorder {
  const calls: string[] = [];
  const state = { candidateWrites: 0, promotions: 0 };
  const steps: GenerationSteps = {
    typecheck: async ({ packageRoot, emittedRoot }) => {
      calls.push("typecheck");
      if (options.typecheckOk === false) {
        return { ok: false, summary: "2 type errors" };
      }
      return await emitFixture(packageRoot, emittedRoot);
    },
    emitCandidate: ({ candidateRoot }) => {
      calls.push("candidate");
      state.candidateWrites += 1;
      mkdirSync(join(candidateRoot, "node"), { recursive: true });
      writeFileSync(
        join(candidateRoot, "node", "index.js"),
        "export const candidate = true;\n",
      );
      return Promise.resolve(
        options.candidateOk === false
          ? { ok: false, summary: "the bundle failed" }
          : { ok: true },
      );
    },
    verifyPackedConsumers: () => {
      calls.push("packed");
      return Promise.resolve({
        ok: options.packedOk !== false,
        consumers: options.consumers ?? ["node", "browser"],
        ...(options.packedOk === false && { summary: "node consumer failed" }),
      });
    },
    promote: async (request) => {
      calls.push("promote");
      state.promotions += 1;
      await promoteCandidate(request);
    },
  };
  return {
    steps,
    calls,
    get candidateWrites() {
      return state.candidateWrites;
    },
    get promotions() {
      return state.promotions;
    },
  };
}
