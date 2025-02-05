/**
 * This is a scaffold file meant for customization:
 * - change it by adding new tests or modifying the existing ones
 */

import {
  createDocument,
  initialGlobalState,
  initialLocalState,
} from "@document-models/account-snapshot/gen/utils.js";

describe("Account Snapshot Document Model", () => {
  it("should create a new Account Snapshot document", () => {
    const document = createDocument();

    expect(document).toBeDefined();
    expect(document.documentType).toBe("powerhouse/account-snapshot");
  });

  it("should create a new Account Snapshot document with a valid initial state", () => {
    const document = createDocument();
    expect(document.state.global).toStrictEqual(initialGlobalState);
    expect(document.state.local).toStrictEqual(initialLocalState);
  });
});
