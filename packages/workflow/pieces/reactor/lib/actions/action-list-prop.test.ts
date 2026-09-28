import { describe, expect, it } from "vitest";
import { documentCreateAction } from "./document-create.js";
import { documentDispatchAction } from "./document-dispatch.js";

describe("Action list (JSON)", () => {
  it("asks for a monospace field on both blocks", () => {
    for (const action of [documentCreateAction, documentDispatchAction]) {
      const prop = action.props.actions as unknown as {
        type: string;
        display?: string;
      };
      expect(prop.type).toBe("LONG_TEXT");
      expect(prop.display).toBe("code");
    }
  });
});
