import { generateMock } from "document-model";
import {
  addMember,
  AddMemberInputSchema,
  isReactorGroupDocument,
  reducer,
  removeMember,
  RemoveMemberInputSchema,
  setGroupDescription,
  SetGroupDescriptionInputSchema,
  setGroupName,
  SetGroupNameInputSchema,
  utils,
} from "document-models/reactor-group/v1";
import { describe, expect, it } from "vitest";

describe("GroupOperations", () => {
  it("should handle setGroupName operation", () => {
    const document = utils.createDocument();
    const input = generateMock(SetGroupNameInputSchema());

    const updatedDocument = reducer(document, setGroupName(input));

    expect(isReactorGroupDocument(updatedDocument)).toBe(true);
    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].action.type).toBe(
      "SET_GROUP_NAME",
    );
    expect(updatedDocument.operations.global[0].action.input).toStrictEqual(
      input,
    );
    expect(updatedDocument.operations.global[0].index).toEqual(0);
  });

  it("should handle setGroupDescription operation", () => {
    const document = utils.createDocument();
    const input = generateMock(SetGroupDescriptionInputSchema());

    const updatedDocument = reducer(document, setGroupDescription(input));

    expect(isReactorGroupDocument(updatedDocument)).toBe(true);
    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].action.type).toBe(
      "SET_GROUP_DESCRIPTION",
    );
    expect(updatedDocument.operations.global[0].action.input).toStrictEqual(
      input,
    );
    expect(updatedDocument.operations.global[0].index).toEqual(0);
  });

  it("should handle addMember operation", () => {
    const document = utils.createDocument();
    const input = generateMock(AddMemberInputSchema());

    const updatedDocument = reducer(document, addMember(input));

    expect(isReactorGroupDocument(updatedDocument)).toBe(true);
    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].action.type).toBe("ADD_MEMBER");
    expect(updatedDocument.operations.global[0].action.input).toStrictEqual(
      input,
    );
    expect(updatedDocument.operations.global[0].index).toEqual(0);
  });

  it("should handle removeMember operation", () => {
    const document = utils.createDocument();
    const input = generateMock(RemoveMemberInputSchema());

    const updatedDocument = reducer(document, removeMember(input));

    expect(isReactorGroupDocument(updatedDocument)).toBe(true);
    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].action.type).toBe(
      "REMOVE_MEMBER",
    );
    expect(updatedDocument.operations.global[0].action.input).toStrictEqual(
      input,
    );
    expect(updatedDocument.operations.global[0].index).toEqual(0);
  });
});
