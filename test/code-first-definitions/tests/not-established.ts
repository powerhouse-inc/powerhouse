import { describe, it } from "vitest";

export function declareNotEstablished(gate: string, reason: string): void {
  describe.skip(`${gate} NOT ESTABLISHED`, () => {
    it(reason, () => undefined);
  });
}
