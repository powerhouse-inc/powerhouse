export type ErrorCode = "UnsupportedProcessorTypeError";

export interface ReducerError {
  errorCode: ErrorCode;
}

export class UnsupportedProcessorTypeError
  extends Error
  implements ReducerError
{
  errorCode = "UnsupportedProcessorTypeError" as ErrorCode;
  constructor(message = "UnsupportedProcessorTypeError") {
    super(message);
  }
}

export const errors = {
  SetProcessorType: { UnsupportedProcessorTypeError },
};
