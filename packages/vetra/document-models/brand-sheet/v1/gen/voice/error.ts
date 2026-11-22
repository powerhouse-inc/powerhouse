export type ErrorCode = "VoiceNotSetError";

export interface ReducerError {
  errorCode: ErrorCode;
}

export class VoiceNotSetError extends Error implements ReducerError {
  errorCode = "VoiceNotSetError" as ErrorCode;
  constructor(message = "VoiceNotSetError") {
    super(message);
  }
}

export const errors = {
  UpdateVoice: { VoiceNotSetError },
};
