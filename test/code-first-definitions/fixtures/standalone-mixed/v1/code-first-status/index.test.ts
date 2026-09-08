import { describe, expect, it } from "vitest";
import { CodeFirstStatusSubgraph } from "./index.js";

describe("CodeFirstStatusSubgraph", () => {
  it("publishes a typed definition", () => {
    expect(CodeFirstStatusSubgraph.definition.name).toBe("code-first-status");
    expect(CodeFirstStatusSubgraph.definition.schemaKind).toBe("typed");
  });
});
