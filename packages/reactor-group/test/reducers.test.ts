import {
  groupDocumentType,
  groupMembershipActionTypes,
} from "@powerhousedao/shared/document-model";
import {
  addMember,
  reactorGroupDocumentType,
  ReactorGroup,
  reducer,
  removeMember,
  setGroupDescription,
  setGroupName,
  utils,
} from "document-models/reactor-group/v1";
import { describe, expect, it } from "vitest";
import {
  MAX_GROUP_DESCRIPTION_LENGTH,
  MAX_GROUP_MEMBERS,
  MAX_GROUP_NAME_LENGTH,
} from "../document-models/reactor-group/v1/src/reducers/group.js";

describe("document type", () => {
  it("matches the groupDocumentType constant the auth scope checks", () => {
    expect(reactorGroupDocumentType).toBe(groupDocumentType);
    expect(ReactorGroup.documentModel.global.id).toBe(groupDocumentType);
  });

  it("declares every membership action type the groups projection reads", () => {
    const operationNames =
      ReactorGroup.documentModel.global.specifications.flatMap(
        (specification) =>
          specification.modules.flatMap((module) =>
            module.operations.map((operation) => operation.name),
          ),
      );
    for (const type of groupMembershipActionTypes) {
      expect(operationNames).toContain(type);
    }
  });
});

describe("setGroupName", () => {
  it("sets the trimmed name", () => {
    const document = utils.createDocument();
    const updated = reducer(document, setGroupName({ name: "  Legal Staff " }));
    expect(updated.operations.global[0].error).toBeUndefined();
    expect(updated.state.global.name).toBe("Legal Staff");
  });

  it("rejects an empty name", () => {
    const document = utils.createDocument();
    const updated = reducer(document, setGroupName({ name: "   " }));
    expect(updated.operations.global[0].error).toContain("Group name");
    expect(updated.state.global.name).toBe("");
  });

  it("rejects a name over the length cap", () => {
    const document = utils.createDocument();
    const updated = reducer(
      document,
      setGroupName({ name: "a".repeat(MAX_GROUP_NAME_LENGTH + 1) }),
    );
    expect(updated.operations.global[0].error).toContain("Group name");
    expect(updated.state.global.name).toBe("");
  });
});

describe("setGroupDescription", () => {
  it("sets the description", () => {
    const document = utils.createDocument();
    const updated = reducer(
      document,
      setGroupDescription({ description: "Reviews toll statements" }),
    );
    expect(updated.operations.global[0].error).toBeUndefined();
    expect(updated.state.global.description).toBe("Reviews toll statements");
  });

  it("rejects a description over the length cap", () => {
    const document = utils.createDocument();
    const updated = reducer(
      document,
      setGroupDescription({
        description: "a".repeat(MAX_GROUP_DESCRIPTION_LENGTH + 1),
      }),
    );
    expect(updated.operations.global[0].error).toContain("Group description");
    expect(updated.state.global.description).toBe("");
  });
});

describe("addMember", () => {
  it("adds a trimmed member address", () => {
    const document = utils.createDocument();
    const updated = reducer(document, addMember({ address: " 0xAbC1 " }));
    expect(updated.operations.global[0].error).toBeUndefined();
    expect(updated.state.global.members).toEqual(["0xAbC1"]);
  });

  it("rejects an empty address", () => {
    const document = utils.createDocument();
    const updated = reducer(document, addMember({ address: "   " }));
    expect(updated.operations.global[0].error).toContain("Member address");
    expect(updated.state.global.members).toEqual([]);
  });

  it("rejects a duplicate under case-insensitive comparison", () => {
    const document = utils.createDocument({
      global: { name: "", description: "", members: ["0xAbC1"] },
    });
    const updated = reducer(document, addMember({ address: "0xabc1" }));
    expect(updated.operations.global[0].error).toContain("already a member");
    expect(updated.state.global.members).toEqual(["0xAbC1"]);
  });

  it("rejects an address past the member cap", () => {
    const members = Array.from(
      { length: MAX_GROUP_MEMBERS },
      (_, i) => `0x${i}`,
    );
    const document = utils.createDocument({
      global: { name: "", description: "", members },
    });
    const updated = reducer(document, addMember({ address: "0xNew" }));
    expect(updated.operations.global[0].error).toContain("at most");
    expect(updated.state.global.members).toHaveLength(MAX_GROUP_MEMBERS);
  });
});

describe("removeMember", () => {
  it("removes a member matched case-insensitively", () => {
    const document = utils.createDocument({
      global: { name: "", description: "", members: ["0xAbC1", "0xDeF2"] },
    });
    const updated = reducer(document, removeMember({ address: "0XABC1" }));
    expect(updated.operations.global[0].error).toBeUndefined();
    expect(updated.state.global.members).toEqual(["0xDeF2"]);
  });

  it("rejects an unknown address", () => {
    const document = utils.createDocument({
      global: { name: "", description: "", members: ["0xAbC1"] },
    });
    const updated = reducer(document, removeMember({ address: "0xNope" }));
    expect(updated.operations.global[0].error).toContain("not a member");
    expect(updated.state.global.members).toEqual(["0xAbC1"]);
  });
});
