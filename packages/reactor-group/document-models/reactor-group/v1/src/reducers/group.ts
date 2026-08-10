import type { ReactorGroupGroupOperations } from "document-models/reactor-group/v1";
import {
  DuplicateMember,
  GroupMemberLimitExceeded,
  InvalidGroupDescription,
  InvalidGroupName,
  InvalidMemberAddress,
  MemberNotFound,
} from "../../gen/group/error.js";

/** Every replica folds group state during auth evaluation, so membership is capped. */
export const MAX_GROUP_MEMBERS = 1000;

export const MAX_GROUP_NAME_LENGTH = 200;

export const MAX_GROUP_DESCRIPTION_LENGTH = 2000;

/** Addresses are compared case-insensitively, matching { address } principals. */
function sameAddress(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

export const reactorGroupGroupOperations: ReactorGroupGroupOperations = {
  setGroupNameOperation(state, action) {
    const name = action.input.name.trim();
    if (name === "" || name.length > MAX_GROUP_NAME_LENGTH) {
      throw new InvalidGroupName(
        `Group name must be non-empty and at most ${MAX_GROUP_NAME_LENGTH} characters`,
      );
    }
    state.name = name;
  },
  setGroupDescriptionOperation(state, action) {
    const description = action.input.description;
    if (description.length > MAX_GROUP_DESCRIPTION_LENGTH) {
      throw new InvalidGroupDescription(
        `Group description must be at most ${MAX_GROUP_DESCRIPTION_LENGTH} characters`,
      );
    }
    state.description = description;
  },
  addMemberOperation(state, action) {
    const address = action.input.address.trim();
    if (address === "") {
      throw new InvalidMemberAddress("Member address must be non-empty");
    }
    if (state.members.some((member) => sameAddress(member, address))) {
      throw new DuplicateMember(`Address is already a member: ${address}`);
    }
    if (state.members.length >= MAX_GROUP_MEMBERS) {
      throw new GroupMemberLimitExceeded(
        `A group holds at most ${MAX_GROUP_MEMBERS} members`,
      );
    }
    state.members.push(address);
  },
  removeMemberOperation(state, action) {
    const address = action.input.address.trim();
    const index = state.members.findIndex((member) =>
      sameAddress(member, address),
    );
    if (index === -1) {
      throw new MemberNotFound(`Address is not a member: ${address}`);
    }
    state.members.splice(index, 1);
  },
};
