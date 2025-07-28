/**
 * This is a scaffold file meant for customization:
 * - change it by adding new tests or modifying the existing ones
 */

import { describe, it, expect, beforeEach } from "vitest";
import utils, {
  initialGlobalState,
  initialLocalState,
} from "../../gen/utils.js";

describe("Vetra Package Document Model", () => {
  it("should create a new Vetra Package document", () => {
    const document = utils.createDocument();

    expect(document).toBeDefined();
    expect(document.header.documentType).toBe("vetra/package-information");
  });

  it("should create a new Vetra Package document with a valid initial state", () => {
    const document = utils.createDocument();
    expect(document.state.global).toStrictEqual(initialGlobalState);
    expect(document.state.local).toStrictEqual(initialLocalState);
  });
});
