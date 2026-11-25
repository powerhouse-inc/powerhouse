export type ErrorCode = "CoreJobNotSetError";

export interface ReducerError {
  errorCode: ErrorCode;
}

export class CoreJobNotSetError extends Error implements ReducerError {
  errorCode = "CoreJobNotSetError" as ErrorCode;
  constructor(message = "CoreJobNotSetError") {
    super(message);
  }
}

export const errors = {
  UpdateCoreJob: { CoreJobNotSetError },
};
