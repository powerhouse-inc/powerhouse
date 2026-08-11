export type ErrorCode =
  | "InvalidGroupName"
  | "InvalidGroupDescription"
  | "InvalidMemberAddress"
  | "DuplicateMember"
  | "GroupMemberLimitExceeded"
  | "MemberNotFound";

export interface ReducerError {
  errorCode: ErrorCode;
}

export class InvalidGroupName extends Error implements ReducerError {
  errorCode = "InvalidGroupName" as ErrorCode;
  constructor(message = "InvalidGroupName") {
    super(message);
  }
}

export class InvalidGroupDescription extends Error implements ReducerError {
  errorCode = "InvalidGroupDescription" as ErrorCode;
  constructor(message = "InvalidGroupDescription") {
    super(message);
  }
}

export class InvalidMemberAddress extends Error implements ReducerError {
  errorCode = "InvalidMemberAddress" as ErrorCode;
  constructor(message = "InvalidMemberAddress") {
    super(message);
  }
}

export class DuplicateMember extends Error implements ReducerError {
  errorCode = "DuplicateMember" as ErrorCode;
  constructor(message = "DuplicateMember") {
    super(message);
  }
}

export class GroupMemberLimitExceeded extends Error implements ReducerError {
  errorCode = "GroupMemberLimitExceeded" as ErrorCode;
  constructor(message = "GroupMemberLimitExceeded") {
    super(message);
  }
}

export class MemberNotFound extends Error implements ReducerError {
  errorCode = "MemberNotFound" as ErrorCode;
  constructor(message = "MemberNotFound") {
    super(message);
  }
}

export const errors = {
  SetGroupName: { InvalidGroupName },

  SetGroupDescription: { InvalidGroupDescription },

  AddMember: {
    InvalidMemberAddress,
    DuplicateMember,
    GroupMemberLimitExceeded,
  },

  RemoveMember: { MemberNotFound },
};
